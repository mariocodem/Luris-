import { describe, expect, it } from 'vitest';
import type {
  DetalleDeProceso,
  RepositorioDeProcesos,
} from '@/modules/procesos/application/puertos';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { type FechaOficial, leerFechaOficial } from '@/shared/domain/fechas';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { ActuacionExterna, ResultadoConsulta } from '../domain/consulta';
import { ErrorDeLectura, ErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { LectorDeConsultaAsistida, PlataformaJudicial } from '../domain/puertos';
import {
  crearConfirmarConsultaAsistida,
  crearInterpretarConsultaAsistida,
  crearPrepararConsultaAsistida,
} from './consulta-asistida';
import { crearProgramarSincronizacion } from './programar-sincronizacion';
import type {
  ColaDeTrabajos,
  DatosDeGuardado,
  EstadoDeTrabajo,
  ProcesoASincronizar,
  RepositorioDePendientes,
  RepositorioDeSincronizacion,
  SolicitudDeSincronizacion,
} from './puertos';
import { crearSincronizarProceso } from './sincronizar-proceso';
import { crearConsultarAvance, crearSolicitarConsulta } from './solicitar-consulta';

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
const PROCESO = '00000000-0000-7000-8000-0000000000a1';
const RADICADO = '50001400300120210034300';

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

function fecha(texto: string): FechaOficial {
  const f = leerFechaOficial(texto);
  if (!f) throw new Error(texto);
  return f;
}

function actuacion(id: string, dia: string, documentos = false): ActuacionExterna {
  return {
    idExterno: id,
    expediente: '107906391',
    despachoJudicial: 'JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO',
    fechaActuacion: fecha(dia),
    fechaRegistro: fecha(dia),
    descripcion: `Actuación ${id}`,
    anotacion: null,
    terminoInicia: null,
    terminoVence: null,
    tieneDocumentos: documentos,
  };
}

function resultado(actuaciones: ActuacionExterna[], reservado = false): ResultadoConsulta {
  return {
    plataforma: 'RAMA_CPNU',
    expedientes: [
      {
        idExterno: '107906391',
        despachoJudicial: 'JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO',
        departamento: 'META',
        ponente: null,
        tipoProceso: null,
        claseProceso: 'PROCESOS EJECUTIVOS',
        subclaseProceso: null,
        recurso: null,
        ubicacion: null,
        fechaRadicacion: fecha('2021-04-09'),
        ultimaActuacion: null,
        sujetos: [],
        reservado,
        detalles: [],
        urlDeConsulta: null,
      },
    ],
    actuaciones,
  };
}

// ─── Dobles en memoria ────────────────────────────────────────────────────────

function crearRepositorio(
  procesos: ProcesoASincronizar[] = [{ id: PROCESO, radicado: RADICADO, nunc: null }],
) {
  const guardadas = new Map<
    string,
    { id: string; tieneDocumentos: boolean; cargaInicial: boolean }
  >();
  const fallos: string[] = [];
  let sincronizado = false;
  const repositorio: RepositorioDeSincronizacion = {
    async obtenerProceso(_d, id) {
      return procesos.find((p) => p.id === id) ?? null;
    },
    async estadoPrevio() {
      return { yaSincronizado: sincronizado, claves: new Set(guardadas.keys()) };
    },
    async guardarResultado(_d, _p, datos: DatosDeGuardado) {
      sincronizado = true;
      return datos.nuevas.map((a) => {
        const guardada = {
          id: `act-${a.clave}`,
          clave: a.clave,
          tieneDocumentos: a.tieneDocumentos,
          cargaInicial: datos.cargaInicial,
        };
        guardadas.set(a.clave, guardada);
        return guardada;
      });
    },
    async registrarFallo(_d, _p, _pl, codigo) {
      fallos.push(codigo);
    },
    async despachosActivos() {
      return [DESPACHO.id, '00000000-0000-7000-8000-000000000002'];
    },
    async procesosActivos(despachoId) {
      return despachoId === DESPACHO.id ? procesos : [];
    },
  };
  return { repositorio, guardadas, fallos };
}

function crearCola() {
  const encoladas: { solicitud: SolicitudDeSincronizacion; prioridad: string }[] = [];
  const documentos: string[] = [];
  const estados = new Map<
    string,
    { despachoId: string; procesoId: string; estado: EstadoDeTrabajo }
  >();
  const cola: ColaDeTrabajos = {
    async encolarSincronizacion(solicitud, prioridad) {
      encoladas.push({ solicitud, prioridad });
      return `00000000-0000-7000-8000-00000000000${encoladas.length}`;
    },
    async encolarSincronizaciones(solicitudes) {
      for (const solicitud of solicitudes) encoladas.push({ solicitud, prioridad: 'NORMAL' });
      return solicitudes.length;
    },
    async estadoDeSincronizacion(_p, id) {
      return estados.get(id) ?? null;
    },
    async encolarVerificacion() {},
    async encolarCodigoDeAcceso() {},
    async encolarDocumentos({ actuacionId }) {
      documentos.push(actuacionId);
    },
  };
  return { cola, encoladas, documentos, estados };
}

function plataforma(
  respuestas: Awaited<ReturnType<PlataformaJudicial['consultar']>>[],
): PlataformaJudicial & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    codigo: 'RAMA_CPNU',
    identificador: 'RADICADO',
    pedidos,
    async consultar(id) {
      pedidos.push(id);
      const respuesta = respuestas.shift();
      if (!respuesta) throw new Error('sin respuesta preparada');
      return respuesta;
    },
  };
}

function sincronizador(cpnu: PlataformaJudicial, repo = crearRepositorio(), cola = crearCola()) {
  const sincronizar = crearSincronizarProceso({
    plataformas: new Map<CodigoPlataforma, PlataformaJudicial>([['RAMA_CPNU', cpnu]]),
    conDocumentos: new Set<CodigoPlataforma>(['RAMA_CPNU']),
    repositorio: repo.repositorio,
    cola: cola.cola,
    reloj: { ahora: () => new Date('2026-11-16T15:00:00Z') },
    logger: silencioso,
  });
  return { sincronizar, repo, cola };
}

const SOLICITUD = { despachoId: DESPACHO.id, procesoId: PROCESO, plataforma: 'RAMA_CPNU' } as const;

// ─── Sincronizar ──────────────────────────────────────────────────────────────

describe('sincronizarProceso', () => {
  it('la primera consulta guarda todo como carga inicial (historia, no novedades)', async () => {
    const cpnu = plataforma([
      ok(resultado([actuacion('1', '2026-10-01'), actuacion('2', '2026-10-21', true)])),
    ]);
    const { sincronizar, repo, cola } = sincronizador(cpnu);

    const r = await sincronizar(SOLICITUD, {});

    expect(r).toEqual(
      ok({ tipo: 'SINCRONIZADO', nuevas: 2, total: 2, cargaInicial: true, reservado: false }),
    );
    expect(cpnu.pedidos).toEqual([RADICADO]);
    expect([...repo.guardadas.values()].every((a) => a.cargaInicial)).toBe(true);
    // Solo las actuaciones con documentos piden su descarga.
    expect(cola.documentos).toEqual(['act-2']);
  });

  it('las siguientes consultas solo guardan lo nuevo, y ya no es carga inicial', async () => {
    const primera = [actuacion('1', '2026-10-01'), actuacion('2', '2026-10-21')];
    const cpnu = plataforma([
      ok(resultado(primera)),
      ok(resultado([actuacion('3', '2026-11-13'), ...primera])),
    ]);
    const { sincronizar, repo } = sincronizador(cpnu);

    await sincronizar(SOLICITUD, {});
    const segunda = await sincronizar(SOLICITUD, {});

    expect(segunda).toEqual(
      ok({ tipo: 'SINCRONIZADO', nuevas: 1, total: 3, cargaInicial: false, reservado: false }),
    );
    expect(repo.guardadas.get('3')?.cargaInicial).toBe(false);
  });

  it('en la carga inicial solo pide los documentos de las 10 actuaciones más recientes', async () => {
    const historia = Array.from({ length: 14 }, (_, i) =>
      actuacion(`d${i}`, `2026-10-${String(28 - i).padStart(2, '0')}`, true),
    );
    const { sincronizar, cola } = sincronizador(plataforma([ok(resultado(historia))]));
    await sincronizar(SOLICITUD, {});
    expect(cola.documentos).toEqual(historia.slice(0, 10).map((a) => `act-${a.idExterno}`));
  });

  it('después de la carga inicial, pide los documentos de todas las nuevas', async () => {
    const nuevas = Array.from({ length: 12 }, (_, i) => actuacion(`n${i}`, '2026-11-13', true));
    const cpnu = plataforma([ok(resultado([])), ok(resultado(nuevas))]);
    const { sincronizar, cola } = sincronizador(cpnu);
    await sincronizar(SOLICITUD, {});
    await sincronizar(SOLICITUD, {});
    expect(cola.documentos).toHaveLength(12);
  });

  it('sin cambios, no guarda nada', async () => {
    const lista = [actuacion('1', '2026-10-01')];
    const { sincronizar } = sincronizador(plataforma([ok(resultado(lista)), ok(resultado(lista))]));
    await sincronizar(SOLICITUD, {});
    expect(await sincronizar(SOLICITUD, {})).toEqual(
      ok({ tipo: 'SINCRONIZADO', nuevas: 0, total: 1, cargaInicial: false, reservado: false }),
    );
  });

  it('un fallo de la plataforma queda registrado y se devuelve para decidir el reintento', async () => {
    const caida = new ErrorPlataforma('RAMA_CPNU', 'PLATAFORMA_NO_DISPONIBLE', 'HTTP 503');
    const { sincronizar, repo } = sincronizador(plataforma([err(caida)]));
    const r = await sincronizar(SOLICITUD, {});
    expect(r).toEqual(err(caida));
    expect(repo.fallos).toEqual(['PLATAFORMA_NO_DISPONIBLE']);
  });

  it('informa los procesos reservados', async () => {
    const { sincronizar } = sincronizador(plataforma([ok(resultado([], true))]));
    const r = await sincronizar(SOLICITUD, {});
    expect(r.ok && r.value).toMatchObject({ tipo: 'SINCRONIZADO', reservado: true, nuevas: 0 });
  });

  it('omite sin consultar si el proceso no existe o no tiene el identificador de la plataforma', async () => {
    const cpnu = plataforma([]);
    const soloNunc = crearRepositorio([
      { id: PROCESO, radicado: null, nunc: '110016000049202300123' },
    ]);
    const { sincronizar } = sincronizador(cpnu, soloNunc);
    expect(await sincronizar(SOLICITUD, {})).toEqual(
      ok({ tipo: 'OMITIDO', motivo: 'SIN_IDENTIFICADOR' }),
    );
    expect(await sincronizar({ ...SOLICITUD, procesoId: 'otro' }, {})).toEqual(
      ok({ tipo: 'OMITIDO', motivo: 'PROCESO_NO_ENCONTRADO' }),
    );
    expect(await sincronizar({ ...SOLICITUD, plataforma: 'SAMAI' }, {})).toEqual(
      ok({ tipo: 'OMITIDO', motivo: 'PLATAFORMA_NO_CONFIGURADA' }),
    );
    expect(cpnu.pedidos).toEqual([]);
  });
});

// ─── Consultar ahora ──────────────────────────────────────────────────────────

function sesion(rol: RolDeDespacho, membresiaId = `m-${rol}`): ContextoMiembro {
  return {
    usuarioId: `u-${membresiaId}`,
    nombre: rol,
    email: `${rol}@demo.test`,
    perfil: rol,
    despacho: DESPACHO,
    membresiaId,
  };
}

function procesos(detalle: Partial<DetalleDeProceso> = {}): RepositorioDeProcesos {
  const proceso: DetalleDeProceso = {
    id: PROCESO,
    radicado: RADICADO,
    nunc: null,
    alias: 'Ejecutivo',
    cliente: null,
    activo: true,
    creadoEn: new Date(),
    etiquetas: [],
    asignaciones: [
      {
        membresiaId: 'm-abogado',
        tipo: 'RESPONSABLE',
        nombre: 'Carlos',
        rol: 'abogado',
        activa: true,
      },
    ],
    plataformas: [],
    actuaciones: [],
    totalActuaciones: 0,
    ...detalle,
  };
  const noUsado = () => {
    throw new Error('no se usa en esta prueba');
  };
  return {
    buscar: async (_d, id) => (id === PROCESO ? proceso : null),
    listar: noUsado,
    buscarPorIdentificadores: noUsado,
    registrar: noUsado,
    registrarVarios: noUsado,
    actualizar: noUsado,
    cambiarActivo: noUsado,
    establecerResponsable: noUsado,
    agregarAsignado: noUsado,
    quitarAsignado: noUsado,
  };
}

const AUTOMATICAS = [{ codigo: 'RAMA_CPNU', identificador: 'RADICADO' }] as const;

describe('solicitarConsulta («Consultar ahora»)', () => {
  it('encola con prioridad alta la consulta en cada plataforma automática', async () => {
    const { cola, encoladas } = crearCola();
    const solicitar = crearSolicitarConsulta({
      procesos: procesos(),
      cola,
      automaticas: AUTOMATICAS,
    });
    const r = await solicitar(sesion('abogado'), PROCESO);
    expect(r.ok && r.value).toEqual([{ plataforma: 'RAMA_CPNU', idTrabajo: expect.any(String) }]);
    expect(encoladas).toEqual([{ solicitud: SOLICITUD, prioridad: 'ALTA' }]);
  });

  it('quien no puede ver el proceso recibe «no encontrado» y no se encola nada', async () => {
    const { cola, encoladas } = crearCola();
    const solicitar = crearSolicitarConsulta({
      procesos: procesos(),
      cola,
      automaticas: AUTOMATICAS,
    });
    const r = await solicitar(sesion('asistente'), PROCESO);
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
    expect(encoladas).toEqual([]);
  });

  it('un proceso solo con NUNC explica que el SPOA se consulta con su confirmación', async () => {
    const { cola } = crearCola();
    const solicitar = crearSolicitarConsulta({
      procesos: procesos({ radicado: null, nunc: '110016000049202300123' }),
      cola,
      automaticas: AUTOMATICAS,
    });
    const r = await solicitar(sesion('administrador'), PROCESO);
    expect(r.ok || r.error.codigo).toBe('SIN_CONSULTA_AUTOMATICA');
  });
});

describe('consultarAvance', () => {
  const ID = '00000000-0000-7000-8000-0000000000f1';

  async function avance(estado: EstadoDeTrabajo, deOtroProceso = false) {
    const { cola, estados } = crearCola();
    estados.set(ID, {
      despachoId: DESPACHO.id,
      procesoId: deOtroProceso ? 'otro' : PROCESO,
      estado,
    });
    const consultar = crearConsultarAvance({
      procesos: procesos(),
      cola,
      automaticas: AUTOMATICAS,
    });
    const r = await consultar(sesion('administrador'), PROCESO, [
      { plataforma: 'RAMA_CPNU', idTrabajo: ID },
    ]);
    if (!r.ok) throw r.error;
    return r.value[0];
  }

  it('en cola o en curso sigue esperando', async () => {
    expect(await avance({ estado: 'EN_COLA' })).toMatchObject({
      estado: 'EN_CURSO',
      mensaje: 'Consultando la Rama Judicial…',
    });
    expect((await avance({ estado: 'EN_CURSO' }))?.estado).toBe('EN_CURSO');
  });

  it('terminado: informa las novedades', async () => {
    expect(
      await avance({
        estado: 'TERMINADO',
        resumen: {
          tipo: 'SINCRONIZADO',
          nuevas: 2,
          total: 75,
          cargaInicial: false,
          reservado: false,
        },
      }),
    ).toEqual({
      plataforma: 'RAMA_CPNU',
      estado: 'TERMINADA',
      mensaje: 'Hay 2 actuaciones nuevas en la Rama Judicial.',
      nuevas: 2,
    });
  });

  it('reintentando o fallido: lo dice en lenguaje claro', async () => {
    const reintentando = await avance({ estado: 'REINTENTANDO' });
    expect(reintentando?.estado).toBe('CON_PROBLEMAS');
    expect(reintentando?.mensaje).toContain('Volveremos a intentarlo automáticamente');
    expect(
      (await avance({ estado: 'TERMINADO', resumen: { tipo: 'FALLIDO', codigo: 'NO_ENCONTRADO' } }))
        ?.mensaje,
    ).toContain('No encontramos este proceso');
  });

  it('no revela trabajos de otro proceso', async () => {
    const otro = await avance(
      {
        estado: 'TERMINADO',
        resumen: {
          tipo: 'SINCRONIZADO',
          nuevas: 9,
          total: 9,
          cargaInicial: true,
          reservado: false,
        },
      },
      true,
    );
    expect(otro).toMatchObject({ estado: 'CON_PROBLEMAS', nuevas: 0 });
    expect(otro?.mensaje).not.toContain('9');
  });
});

function crearPendientes() {
  const abiertos: { despachoId: string; plataforma: string; antesDe: Date }[] = [];
  const resueltos: string[] = [];
  const pendientes: RepositorioDePendientes = {
    async abrirVencidos(despachoId, plataforma, _identificador, antesDe) {
      abiertos.push({ despachoId, plataforma, antesDe });
      return despachoId === DESPACHO.id ? 1 : 0;
    },
    abrirDeConsultaMasiva: async (_d, lista) => lista.length,
    async resolver(_d, procesoId, plataforma) {
      resueltos.push(`${procesoId}:${plataforma}`);
    },
    listar: async () => [],
  };
  return { pendientes, abiertos, resueltos };
}

describe('programarSincronizacion', () => {
  it('encola los procesos de las plataformas automáticas y abre pendientes de las asistidas', async () => {
    const repo = crearRepositorio([
      { id: 'p1', radicado: RADICADO, nunc: null },
      { id: 'p2', radicado: null, nunc: '110016000049202300123' },
      { id: 'p3', radicado: '11001310300120190012300', nunc: '110016000049202300124' },
    ]);
    const { cola, encoladas } = crearCola();
    const { pendientes, abiertos } = crearPendientes();
    const programar = crearProgramarSincronizacion({
      repositorio: repo.repositorio,
      cola,
      automaticas: AUTOMATICAS,
      asistidas: [{ codigo: 'SPOA', identificador: 'NUNC' }],
      pendientes,
      diasEntreConfirmaciones: 7,
      reloj: { ahora: () => new Date('2026-11-16T15:00:00Z') },
      logger: silencioso,
    });
    expect(await programar()).toEqual({ encolados: 2, pendientesAbiertos: 1 });
    expect(encoladas.map((e) => [e.solicitud.procesoId, e.prioridad])).toEqual([
      ['p1', 'NORMAL'],
      ['p3', 'NORMAL'],
    ]);
    // Un pendiente por despacho activo, para lo que no se consulta hace 7 días.
    expect(abiertos).toHaveLength(2);
    expect(abiertos[0]).toEqual({
      despachoId: DESPACHO.id,
      plataforma: 'SPOA',
      antesDe: new Date('2026-11-09T15:00:00Z'),
    });
  });
});

// ─── Consulta asistida (SPOA) ─────────────────────────────────────────────────

const NUNC = '110016000049202300123';

function resultadoSpoa(): ResultadoConsulta {
  return {
    plataforma: 'SPOA',
    expedientes: [
      {
        ...resultado([]).expedientes[0]!,
        idExterno: NUNC,
        detalles: [{ etiqueta: 'Estado', valor: 'ACTIVO' }],
      },
    ],
    actuaciones: [
      { ...actuacion('spoa:a', '2023-05-10'), idExterno: 'spoa:a', fechaRegistro: null },
      { ...actuacion('spoa:b', '2023-04-02'), idExterno: 'spoa:b', fechaRegistro: null },
    ],
  };
}

const lectorSpoa: LectorDeConsultaAsistida = {
  plataforma: 'SPOA',
  identificador: 'NUNC',
  urlDelPortal: 'https://portal.test/',
  interpretar: (texto, nunc) =>
    texto.includes(nunc)
      ? ok(resultadoSpoa())
      : err(new ErrorDeLectura('NO_RECONOCIDO', 'No encontramos el resultado del SPOA.')),
};

function asistida(detalle: Partial<DetalleDeProceso> = { nunc: NUNC }) {
  const repo = crearRepositorio([{ id: PROCESO, radicado: RADICADO, nunc: NUNC }]);
  const { cola } = crearCola();
  const { pendientes, resueltos } = crearPendientes();
  const eventos: EventoDeAuditoria[] = [];
  const deps = {
    procesos: procesos(detalle),
    lectores: new Map<CodigoPlataforma, LectorDeConsultaAsistida>([['SPOA', lectorSpoa]]),
    pendientes,
    auditoria: { registrar: async (e: EventoDeAuditoria) => void eventos.push(e) },
    repositorio: repo.repositorio,
    cola,
    conDocumentos: new Set<CodigoPlataforma>(['RAMA_CPNU']),
    reloj: { ahora: () => new Date('2026-11-16T15:00:00Z') },
    logger: silencioso,
  };
  return {
    preparar: crearPrepararConsultaAsistida(deps),
    interpretar: crearInterpretarConsultaAsistida(deps),
    confirmar: crearConfirmarConsultaAsistida(deps),
    repo,
    resueltos,
    eventos,
  };
}

describe('consulta asistida del SPOA', () => {
  it('prepara el NUNC y el portal oficial para que la persona consulte', async () => {
    const r = await asistida().preparar(sesion('abogado'), PROCESO, 'SPOA');
    expect(r.ok && r.value).toMatchObject({
      numero: NUNC,
      identificador: 'NUNC',
      urlDelPortal: 'https://portal.test/',
    });
  });

  it('sin NUNC, explica que hay que agregarlo', async () => {
    const r = await asistida({ nunc: null }).preparar(sesion('abogado'), PROCESO, 'SPOA');
    expect(r.ok || r.error.codigo).toBe('SIN_IDENTIFICADOR');
    expect(!r.ok && r.error.mensajeUsuario).toContain('el SPOA de la Fiscalía');
  });

  it('quien no puede ver el proceso recibe «no encontrado»', async () => {
    const r = await asistida().preparar(sesion('asistente'), PROCESO, 'SPOA');
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('muestra lo que leyó antes de guardar, sin guardar nada', async () => {
    const { interpretar, repo } = asistida();
    const r = await interpretar(sesion('abogado'), PROCESO, 'SPOA', `Número ${NUNC}`);
    expect(r.ok && r.value).toMatchObject({ nuevas: 2, primeraConsulta: true });
    expect(repo.guardadas.size).toBe(0);
  });

  it('un texto que no es del SPOA se rechaza con instrucciones', async () => {
    const r = await asistida().interpretar(sesion('abogado'), PROCESO, 'SPOA', 'cualquier cosa');
    expect(r.ok || r.error.codigo).toBe('LECTURA_NO_RECONOCIDO');
  });

  it('al confirmar, guarda como cualquier consulta, cierra el pendiente y lo audita', async () => {
    const { confirmar, repo, resueltos, eventos } = asistida();
    const r = await confirmar(sesion('abogado'), {
      procesoId: PROCESO,
      plataforma: 'SPOA',
      texto: `Número ${NUNC}`,
      ip: '10.0.0.1',
    });
    expect(r).toEqual(
      ok({
        mensaje:
          'Trajimos 2 actuaciones del SPOA de la Fiscalía. Desde ahora te avisaremos de las nuevas.',
        nuevas: 2,
      }),
    );
    expect(repo.guardadas.size).toBe(2);
    expect(resueltos).toEqual([`${PROCESO}:SPOA`]);
    expect(eventos[0]).toMatchObject({
      accion: 'PROCESO_CONSULTA_ASISTIDA',
      datos: { plataforma: 'SPOA', nuevas: 2 },
    });

    // Una segunda confirmación con lo mismo no duplica nada.
    const otra = await confirmar(sesion('abogado'), {
      procesoId: PROCESO,
      plataforma: 'SPOA',
      texto: `Número ${NUNC}`,
      ip: null,
    });
    expect(otra.ok && otra.value.mensaje).toBe('Sin actuaciones nuevas en el SPOA de la Fiscalía.');
  });
});
