import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { LectorDeTablas, RepositorioDeProcesos } from '@/modules/procesos/application/puertos';
import type { NuevoProceso } from '@/modules/procesos/application/puertos';
import type { Asignacion } from '@/modules/procesos/domain/proceso';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { contarItems } from '../domain/consulta-masiva';
import {
  crearIniciarConsultaMasiva,
  crearObtenerConsultaMasiva,
  crearPrevisualizarConsultaMasiva,
  crearRegistrarResultadoDeConsultaMasiva,
  crearReintentarConsultaMasiva,
  type DependenciasDeConsultaMasiva,
} from './consulta-masiva';
import type {
  ItemNuevoDeConsultaMasiva,
  LoteDeConsultaMasiva,
  ProcesoParaConsultaMasiva,
  RepositorioDeConsultasMasivas,
  SolicitudDeSincronizacion,
} from './puertos';

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
const R1 = '50001400300120210034300';
const R2 = '11001310300120230012300';
const R3 = '05001333300120230012300'; // lo contencioso administrativo (SAMAI)
const N1 = '110016000049202300123';
const LOTE = '00000000-0000-7000-8000-0000000000b1';

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

interface Estado {
  existentes: ProcesoParaConsultaMasiva[];
  registrados: NuevoProceso[];
  lotesCreados: {
    creadaPorId: string;
    totalProcesos: number;
    items: ItemNuevoDeConsultaMasiva[];
  }[];
  pendientesAbiertos: { procesoId: string; plataforma: string }[];
  encoladas: SolicitudDeSincronizacion[];
  auditoria: EventoDeAuditoria[];
  lote: LoteDeConsultaMasiva | null;
  reintentables: SolicitudDeSincronizacion[];
  resultados: unknown[];
}

function crearEscenario(parcial: Partial<Estado> = {}) {
  const estado: Estado = {
    existentes: [],
    registrados: [],
    lotesCreados: [],
    pendientesAbiertos: [],
    encoladas: [],
    auditoria: [],
    lote: null,
    reintentables: [],
    resultados: [],
    ...parcial,
  };
  let siguiente = 0;

  const masivas: RepositorioDeConsultasMasivas = {
    async procesosPorIdentificadores() {
      return estado.existentes;
    },
    async crear(_d, datos) {
      estado.lotesCreados.push({
        creadaPorId: datos.creadaPorId,
        totalProcesos: datos.totalProcesos,
        items: [...datos.items],
      });
      return { id: LOTE };
    },
    async buscar() {
      return estado.lote;
    },
    async listar() {
      return [];
    },
    async items() {
      return [];
    },
    async conteo() {
      return contarItems([]);
    },
    async registrarResultado(_d, datos) {
      estado.resultados.push(datos);
      return 1;
    },
    async resolverAsistidos() {
      return 0;
    },
    async reintentarFallidos() {
      return estado.reintentables;
    },
  };

  const procesos = {
    // Registrar crea el proceso: la siguiente lectura ya lo encuentra.
    async registrarVarios(_d: string, nuevos: readonly NuevoProceso[]) {
      estado.registrados.push(...nuevos);
      for (const n of nuevos) {
        siguiente += 1;
        estado.existentes.push({
          id: `p-nuevo-${siguiente}`,
          radicado: n.radicado,
          nunc: n.nunc,
          activo: true,
          asignaciones: n.asignaciones,
        });
      }
      return nuevos.length;
    },
  } as unknown as RepositorioDeProcesos;

  const lector: LectorDeTablas = {
    async leer() {
      return { ok: true, value: [['Radicado'], [R1], [R2]] } as never;
    },
  };

  const deps: DependenciasDeConsultaMasiva = {
    masivas,
    procesos,
    pendientes: {
      async abrirDeConsultaMasiva(_d, lista) {
        estado.pendientesAbiertos.push(...lista);
        return lista.length;
      },
      abrirVencidos: async () => 0,
      resolver: async () => undefined,
      listar: async () => [],
    },
    cola: {
      async encolarSincronizaciones(solicitudes: readonly SolicitudDeSincronizacion[]) {
        estado.encoladas.push(...solicitudes);
        return solicitudes.length;
      },
    } as unknown as DependenciasDeConsultaMasiva['cola'],
    lector,
    automaticas: [
      { codigo: 'RAMA_CPNU', identificador: 'RADICADO' },
      {
        codigo: 'SAMAI',
        identificador: 'RADICADO',
        aplica: (id) => id.startsWith('05001333'),
      },
    ],
    asistidas: [{ codigo: 'SPOA', identificador: 'NUNC' }],
    auditoria: {
      async registrar(evento) {
        estado.auditoria.push(evento);
      },
    },
    reloj: { ahora: () => new Date('2026-11-18T15:00:00Z') },
  };
  return { deps, estado };
}

function existente(
  id: string,
  radicado: string | null,
  asignaciones: Asignacion[] = [],
  activo = true,
): ProcesoParaConsultaMasiva {
  return { id, radicado, nunc: null, activo, asignaciones };
}

describe('previsualizarConsultaMasiva', () => {
  it('resume lo válido, lo repetido, lo que ya existe y lo que se registrará', async () => {
    const { deps } = crearEscenario({ existentes: [existente('p1', R1)] });
    const previsualizar = crearPrevisualizarConsultaMasiva(deps);
    const r = await previsualizar(sesion('administrador'), {
      texto: `${R1}\n${R2}\n50001-40-03-001-2021-00343-00\n123`,
      archivo: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.procesos.map((p) => [p.identificador, p.situacion])).toEqual([
      [R1, 'REGISTRADO'],
      [R2, 'NUEVO'],
    ]);
    expect(r.value.nuevos).toBe(1);
    expect(r.value.repetidos).toBe(1);
    expect(r.value.totalErrores).toBe(1);
    expect(r.value.errores[0]?.mensaje).toContain('23 números');
    expect(r.value.consultas).toBe(2);
  });

  it('cada número va a las plataformas que le aplican, y el NUNC es una consulta asistida', async () => {
    const { deps } = crearEscenario();
    const r = await crearPrevisualizarConsultaMasiva(deps)(sesion('abogado'), {
      texto: `${R3}\n${N1}`,
      archivo: null,
    });
    expect(r.ok && r.value.procesos.map((p) => p.plataformas)).toEqual([
      [
        { plataforma: 'RAMA_CPNU', modo: 'AUTOMATICA' },
        { plataforma: 'SAMAI', modo: 'AUTOMATICA' },
      ],
      [{ plataforma: 'SPOA', modo: 'ASISTIDA' }],
    ]);
  });

  it('excluye lo archivado y lo que la persona no puede ver, sin consultarlo', async () => {
    const { deps } = crearEscenario({
      existentes: [
        existente('p1', R1, [{ membresiaId: 'otra', tipo: 'RESPONSABLE' }]),
        existente('p2', R2, [{ membresiaId: 'm-asistente', tipo: 'ASIGNADO' }], false),
      ],
    });
    const r = await crearPrevisualizarConsultaMasiva(deps)(sesion('asistente'), {
      texto: `${R1}\n${R2}`,
      archivo: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.procesos).toEqual([]);
    expect(r.value.excluidos.map((e) => e.motivo)).toEqual(['SIN_ACCESO', 'ARCHIVADO']);
    expect(r.value.excluidos[0]?.mensaje).toContain('Pídele al administrador');
  });

  it('avisa cuando se pasa del máximo de 400', async () => {
    const { deps } = crearEscenario();
    const texto = Array.from(
      { length: 401 },
      (_, i) => `50001400300120210${String(i).padStart(6, '0')}`,
    ).join('\n');
    const r = await crearPrevisualizarConsultaMasiva(deps)(sesion('abogado'), {
      texto,
      archivo: null,
    });
    expect(r.ok && [r.value.procesos.length, r.value.sobrante, r.value.maximo]).toEqual([
      401, 1, 400,
    ]);
  });

  it('lee un archivo y descarta el encabezado', async () => {
    const { deps } = crearEscenario();
    const r = await crearPrevisualizarConsultaMasiva(deps)(sesion('abogado'), {
      texto: null,
      archivo: { nombre: 'lista.xlsx', tipo: '', contenido: new Uint8Array() },
    });
    expect(r.ok && r.value.procesos.map((p) => p.identificador)).toEqual([R1, R2]);
  });

  it('sin números dice qué hacer, y el superadmin no puede', async () => {
    const { deps } = crearEscenario();
    const previsualizar = crearPrevisualizarConsultaMasiva(deps);
    const vacio = await previsualizar(sesion('abogado'), { texto: '  ', archivo: null });
    expect(!vacio.ok && vacio.error.mensajeUsuario).toContain('Pega los números');
    const superadmin = await previsualizar(
      {
        usuarioId: 'u',
        nombre: 's',
        email: 's@x.co',
        perfil: 'superadmin',
        despacho: null,
        membresiaId: null,
      },
      { texto: R1, archivo: null },
    );
    expect(superadmin.ok).toBe(false);
  });
});

describe('iniciarConsultaMasiva', () => {
  it('registra lo nuevo con el creador asignado, crea el lote y encola por prioridad de plataforma', async () => {
    const { deps, estado } = crearEscenario({
      existentes: [existente('p1', R1, [{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }])],
    });
    const r = await crearIniciarConsultaMasiva(deps)(sesion('abogado'), {
      identificadores: [R1, R3, N1],
      ip: '10.0.0.1',
    });
    expect(r).toMatchObject({
      ok: true,
      value: { id: LOTE, procesos: 3, registrados: 2, consultas: 4 },
    });

    // Lo nuevo se registró con el abogado como responsable, sin alias.
    expect(estado.registrados.map((n) => n.radicado ?? n.nunc)).toEqual([R3, N1]);
    expect(estado.registrados.every((n) => n.asignaciones[0]?.tipo === 'RESPONSABLE')).toBe(true);

    // Items: CPNU(R1), CPNU(R3), SAMAI(R3) automáticos; SPOA(N1) pendiente de confirmación.
    const items = estado.lotesCreados[0]?.items ?? [];
    expect(items.map((i) => [i.identificador, i.plataforma, i.estado])).toEqual([
      [R1, 'RAMA_CPNU', 'PENDIENTE'],
      [R3, 'RAMA_CPNU', 'PENDIENTE'],
      [R3, 'SAMAI', 'PENDIENTE'],
      [N1, 'SPOA', 'PENDIENTE_CONFIRMACION'],
    ]);
    expect(estado.lotesCreados[0]).toMatchObject({ creadaPorId: 'm-abogado', totalProcesos: 3 });

    // La CPNU se consulta antes que SAMAI (§1); lo asistido va a la bandeja.
    expect(estado.encoladas.map((s) => s.plataforma)).toEqual(['RAMA_CPNU', 'RAMA_CPNU', 'SAMAI']);
    expect(estado.pendientesAbiertos).toHaveLength(1);
    expect(estado.pendientesAbiertos[0]?.plataforma).toBe('SPOA');
    expect(estado.auditoria[0]).toMatchObject({
      accion: 'CONSULTA_MASIVA_INICIADA',
      entidadId: LOTE,
      datos: { procesos: 3, consultas: 4, registrados: 2 },
    });
  });

  it('rechaza más de 400, aunque el navegador lo haya permitido', async () => {
    const { deps, estado } = crearEscenario();
    const muchos = Array.from(
      { length: 401 },
      (_, i) => `50001400300120210${String(i).padStart(6, '0')}`,
    );
    const r = await crearIniciarConsultaMasiva(deps)(sesion('administrador'), {
      identificadores: muchos,
      ip: null,
    });
    expect(!r.ok && r.error.mensajeUsuario).toContain('máximo 400');
    expect(estado.lotesCreados).toHaveLength(0);
    expect(estado.encoladas).toHaveLength(0);
  });

  it('no consulta procesos ajenos a la persona', async () => {
    const { deps, estado } = crearEscenario({
      existentes: [existente('p1', R1, [{ membresiaId: 'otra', tipo: 'RESPONSABLE' }])],
    });
    const r = await crearIniciarConsultaMasiva(deps)(sesion('abogado'), {
      identificadores: [R1],
      ip: null,
    });
    expect(r.ok).toBe(false);
    expect(estado.encoladas).toHaveLength(0);
    expect(estado.lotesCreados).toHaveLength(0);
  });

  it('sin números válidos no crea nada', async () => {
    const { deps, estado } = crearEscenario();
    const r = await crearIniciarConsultaMasiva(deps)(sesion('abogado'), {
      identificadores: ['abc', '12'],
      ip: null,
    });
    expect(r.ok).toBe(false);
    expect(estado.lotesCreados).toHaveLength(0);
  });
});

describe('acceso a los lotes y reintentos', () => {
  const lote = (creadaPorId: string): LoteDeConsultaMasiva => ({
    id: LOTE,
    creadaPorId,
    creadaPorNombre: 'Alguien',
    estado: 'COMPLETADA',
    totalProcesos: 1,
    iniciadaEn: new Date(),
    finalizadaEn: new Date(),
    creadoEn: new Date(),
  });

  it('cada persona ve sus lotes; el administrador, los de todo el despacho', async () => {
    const { deps } = crearEscenario({ lote: lote('m-otra') });
    const obtener = crearObtenerConsultaMasiva(deps);
    const ajeno = await obtener(sesion('abogado'), LOTE);
    expect(!ajeno.ok && ajeno.error.codigo).toBe('NO_ENCONTRADO');
    expect((await obtener(sesion('administrador'), LOTE)).ok).toBe(true);
    const { deps: propios } = crearEscenario({ lote: lote('m-abogado') });
    expect((await crearObtenerConsultaMasiva(propios)(sesion('abogado'), LOTE)).ok).toBe(true);
  });

  it('reintentar devuelve los fallidos a la cola', async () => {
    const solicitud = {
      despachoId: DESPACHO.id,
      procesoId: 'p1',
      plataforma: 'RAMA_CPNU' as const,
    };
    const { deps, estado } = crearEscenario({
      lote: lote('m-abogado'),
      reintentables: [solicitud],
    });
    const r = await crearReintentarConsultaMasiva(deps)(sesion('abogado'), {
      id: LOTE,
      itemId: null,
      ip: null,
    });
    expect(r).toMatchObject({ ok: true, value: { reintentados: 1 } });
    expect(estado.encoladas).toEqual([solicitud]);
    expect(estado.auditoria[0]?.accion).toBe('CONSULTA_MASIVA_REINTENTADA');
  });

  it('sin fallidos explica que no hay nada que reintentar', async () => {
    const { deps } = crearEscenario({ lote: lote('m-abogado') });
    const r = await crearReintentarConsultaMasiva(deps)(sesion('abogado'), {
      id: LOTE,
      itemId: null,
      ip: null,
    });
    expect(!r.ok && r.error.mensajeUsuario).toContain('No hay consultas fallidas');
  });
});

describe('registrarResultadoDeConsultaMasiva (worker)', () => {
  it('traduce cómo terminó la sincronización al ítem, sin datos técnicos', async () => {
    const { deps, estado } = crearEscenario();
    const registrar = crearRegistrarResultadoDeConsultaMasiva(deps);
    const base = { despachoId: DESPACHO.id, procesoId: 'p1', plataforma: 'RAMA_CPNU' as const };

    await registrar({
      ...base,
      resultado: {
        tipo: 'SINCRONIZADO',
        nuevas: 2,
        total: 10,
        cargaInicial: false,
        reservado: false,
      },
    });
    await registrar({ ...base, resultado: { tipo: 'FALLIDO', codigo: 'NO_ENCONTRADO' } });
    await registrar({
      ...base,
      resultado: { tipo: 'REINTENTO', codigo: 'PLATAFORMA_NO_DISPONIBLE' },
    });

    const guardados = estado.resultados as {
      resultado: { estado: string; resultado: string | null };
    }[];
    expect(guardados.map((g) => [g.resultado.estado, g.resultado.resultado])).toEqual([
      ['COMPLETADO', 'EXITOSA'],
      ['FALLIDO', 'NO_ENCONTRADO'],
      ['EN_PROCESO', null],
    ]);
  });
});
