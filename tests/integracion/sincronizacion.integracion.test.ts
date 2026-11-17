import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearRepositorioDeDocumentos } from '@/modules/documentos/infrastructure/repositorio-de-documentos-prisma';
import { seleccionarNuevas } from '@/modules/plataformas/domain/actuaciones';
import type { ActuacionExterna, ResultadoConsulta } from '@/modules/plataformas/domain/consulta';
import {
  NOMBRES_DE_COLA,
  asegurarColas,
  crearColaDeTrabajos,
} from '@/modules/plataformas/infrastructure/cola-pg-boss';
import { crearRepositorioDeSincronizacion } from '@/modules/plataformas/infrastructure/repositorio-de-sincronizacion-prisma';
import { crearRepositorioDeProcesos } from '@/modules/procesos/infrastructure/repositorio-de-procesos-prisma';
import { type FechaOficial, leerFechaOficial } from '@/shared/domain/fechas';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  type EscenarioDeDespacho,
} from './apoyo';

/**
 * Sincronización (Fase 5) sobre PostgreSQL real: guardado sin duplicados, fechas oficiales,
 * carga inicial, documentos, aislamiento entre despachos y la cola de pg-boss.
 */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let baseDeDatos: Parameters<typeof crearRepositorioDeSincronizacion>[0];
let repo: ReturnType<typeof crearRepositorioDeSincronizacion>;

function fecha(texto: string): FechaOficial {
  const f = leerFechaOficial(texto);
  if (!f) throw new Error(texto);
  return f;
}

function actuacion(id: string, parciales: Partial<ActuacionExterna> = {}): ActuacionExterna {
  return {
    idExterno: id,
    expediente: '107906391',
    despachoJudicial: 'JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO',
    fechaActuacion: fecha('2026-10-21'),
    fechaRegistro: fecha('2026-10-30'),
    descripcion: 'Agregar Memorial',
    anotacion: null,
    terminoInicia: null,
    terminoVence: null,
    tieneDocumentos: false,
    ...parciales,
  };
}

function resultado(actuaciones: ActuacionExterna[]): ResultadoConsulta {
  return {
    plataforma: 'RAMA_CPNU',
    expedientes: [
      {
        idExterno: '107906391',
        despachoJudicial: 'JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO',
        departamento: 'META',
        ponente: 'sandra milena torres diaz',
        tipoProceso: 'Codigo General del Proceso CM',
        claseProceso: 'PROCESOS EJECUTIVOS',
        subclaseProceso: 'En general / Sin subclase',
        recurso: null,
        ubicacion: 'Software: Justicia XXI Web',
        fechaRadicacion: fecha('2021-04-09'),
        ultimaActuacion: fecha('2026-10-21'),
        sujetos: [{ tipo: 'Demandante/accionante', nombre: 'Banco Bancolombia SA' }],
        reservado: false,
        detalles: [],
        urlDeConsulta: null,
      },
    ],
    actuaciones,
  };
}

async function procesoNuevo(despachoId: string, activo = true): Promise<string> {
  const proceso = await prisma.proceso.create({
    data: { despachoId, radicado: digitosAleatorios(23), activo },
  });
  return proceso.id;
}

async function guardar(
  despachoId: string,
  procesoId: string,
  actuaciones: ActuacionExterna[],
  cargaInicial = true,
) {
  const previo = await repo.estadoPrevio(despachoId, procesoId, 'RAMA_CPNU');
  return repo.guardarResultado(despachoId, procesoId, {
    resultado: resultado(actuaciones),
    nuevas: seleccionarNuevas(previo.claves, actuaciones),
    cargaInicial,
    ahora: new Date(),
  });
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  baseDeDatos = {
    paraDespacho: (id: string) => crearClienteDeDespacho(prisma, id),
    sinAislamiento: prisma,
  };
  repo = crearRepositorioDeSincronizacion(baseDeDatos);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('repositorio de sincronización', () => {
  it('guarda las actuaciones con las fechas oficiales tal cual (sin correr el día)', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    const guardadas = await guardar(a.despachoId, procesoId, [
      actuacion('1', { terminoInicia: fecha('2026-11-03'), terminoVence: fecha('2026-11-05') }),
      actuacion('2', { tieneDocumentos: true, fechaRegistro: null }),
    ]);

    expect(guardadas).toHaveLength(2);
    expect(guardadas.filter((g) => g.tieneDocumentos)).toHaveLength(1);

    const filas = await prisma.$queryRaw<
      {
        id_externo: string;
        actuacion: string;
        registro: string | null;
        vence: string | null;
        carga_inicial: boolean;
      }[]
    >`SELECT a.id_externo, to_char(fecha_actuacion, 'YYYY-MM-DD') AS actuacion,
             to_char(fecha_registro, 'YYYY-MM-DD') AS registro,
             to_char(termino_vence, 'YYYY-MM-DD') AS vence, carga_inicial
        FROM actuaciones a JOIN procesos_plataforma p ON p.id = a.proceso_plataforma_id
       WHERE p.proceso_id = ${procesoId}::uuid ORDER BY a.id_externo`;
    expect(filas).toEqual([
      {
        id_externo: '1',
        actuacion: '2026-10-21',
        registro: '2026-10-30',
        vence: '2026-11-05',
        carga_inicial: true,
      },
      {
        id_externo: '2',
        actuacion: '2026-10-21',
        registro: null,
        vence: null,
        carga_inicial: true,
      },
    ]);
  });

  it('nunca duplica: guardar dos veces lo mismo no inserta nada la segunda vez', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    const lista = [actuacion('10'), actuacion('11')];
    await guardar(a.despachoId, procesoId, lista);

    // Simula una carrera: otra sincronización calculó las mismas "nuevas" antes de guardar.
    const otraVez = await repo.guardarResultado(a.despachoId, procesoId, {
      resultado: resultado(lista),
      nuevas: seleccionarNuevas(new Set(), lista),
      cargaInicial: false,
      ahora: new Date(),
    });
    expect(otraVez).toEqual([]);
    expect(await prisma.actuacion.count({ where: { procesoPlataforma: { procesoId } } })).toBe(2);
  });

  it('recuerda si ya hubo una consulta exitosa y qué actuaciones tiene', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    expect(await repo.estadoPrevio(a.despachoId, procesoId, 'RAMA_CPNU')).toEqual({
      yaSincronizado: false,
      claves: new Set(),
    });

    // Un fallo antes del primer éxito no cuenta como sincronizado.
    await repo.registrarFallo(a.despachoId, procesoId, 'RAMA_CPNU', 'NO_ENCONTRADO', new Date());
    expect((await repo.estadoPrevio(a.despachoId, procesoId, 'RAMA_CPNU')).yaSincronizado).toBe(
      false,
    );

    await guardar(a.despachoId, procesoId, [actuacion('20')]);
    const previo = await repo.estadoPrevio(a.despachoId, procesoId, 'RAMA_CPNU');
    expect(previo).toEqual({ yaSincronizado: true, claves: new Set(['20']) });

    // Un fallo posterior conserva la última sincronización exitosa.
    await repo.registrarFallo(
      a.despachoId,
      procesoId,
      'RAMA_CPNU',
      'PLATAFORMA_NO_DISPONIBLE',
      new Date(),
    );
    const registro = await prisma.procesoPlataforma.findUniqueOrThrow({
      where: { procesoId_plataforma: { procesoId, plataforma: 'RAMA_CPNU' } },
    });
    expect(registro.estadoUltimaConsulta).toBe('PLATAFORMA_NO_DISPONIBLE');
    expect(registro.ultimaSincronizacionEn).not.toBeNull();
    expect(registro.idExterno).toBe('107906391');
  });

  it('no deja leer ni escribir procesos de otro despacho', async () => {
    const procesoDeA = await procesoNuevo(a.despachoId);
    expect(await repo.obtenerProceso(b.despachoId, procesoDeA)).toBeNull();
    await expect(guardar(b.despachoId, procesoDeA, [actuacion('30')])).rejects.toThrow();
    expect(await prisma.actuacion.count({ where: { idExterno: '30' } })).toBe(0);
  });

  it('para la sincronización programada: despachos activos y procesos no archivados', async () => {
    const suspendido = await crearEscenarioDeDespacho(prisma);
    await prisma.despacho.update({
      where: { id: suspendido.despachoId },
      data: { estado: 'SUSPENDIDO' },
    });
    const archivado = await procesoNuevo(a.despachoId, false);

    const despachos = await repo.despachosActivos();
    expect(despachos).toContain(a.despachoId);
    expect(despachos).not.toContain(suspendido.despachoId);

    const procesos = await repo.procesosActivos(a.despachoId);
    expect(procesos.map((p) => p.id)).not.toContain(archivado);
    expect(procesos.map((p) => p.id)).not.toContain(b.procesoId);
  });
});

describe('ficha del proceso con lo sincronizado', () => {
  it('muestra datos de la plataforma, términos, documentos y marca solo lo nuevo', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    await prisma.asignacionProceso.create({
      data: {
        despachoId: a.despachoId,
        procesoId,
        membresiaId: a.membresiaId,
        tipo: 'RESPONSABLE',
      },
    });
    const [historia] = await guardar(a.despachoId, procesoId, [
      actuacion('40', { tieneDocumentos: true }),
    ]);
    await guardar(
      a.despachoId,
      procesoId,
      [actuacion('41', { fechaActuacion: fecha('2026-11-13'), terminoVence: fecha('2026-11-20') })],
      false,
    );
    if (!historia) throw new Error('sin actuación');
    const documentos = crearRepositorioDeDocumentos(baseDeDatos.paraDespacho);
    await documentos.registrarReferencias(a.despachoId, historia.id, [
      {
        idExterno: '4038108901',
        nombre: '44AGREGARMEMORIAL.pdf',
        fechaCarga: fecha('2026-10-30'),
        urlOrigen: 'https://p.test/d',
      },
    ]);

    const ficha = await crearRepositorioDeProcesos(baseDeDatos.paraDespacho).buscar(
      a.despachoId,
      procesoId,
    );
    if (!ficha) throw new Error('sin ficha');
    expect(ficha.plataformas[0]?.expedientes[0]).toMatchObject({
      despachoJudicial: 'JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO',
      fechaRadicacion: '2021-04-09',
      sujetos: [{ tipo: 'Demandante/accionante', nombre: 'Banco Bancolombia SA' }],
    });
    const [nueva, vieja] = ficha.actuaciones;
    expect(nueva).toMatchObject({ descripcion: 'Agregar Memorial', nueva: true, documentos: [] });
    expect(nueva?.terminoVence?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(vieja?.nueva).toBe(false);
    expect(vieja?.documentos).toEqual([
      expect.objectContaining({
        nombre: '44AGREGARMEMORIAL.pdf',
        estado: 'PENDIENTE',
        visibleEnLinea: false,
      }),
    ]);
  });
});

describe('repositorio de documentos', () => {
  it('registra referencias una sola vez, las descarga y solo deja abrirlas desde su despacho', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    const [guardada] = await guardar(a.despachoId, procesoId, [
      actuacion('50', { tieneDocumentos: true }),
    ]);
    if (!guardada) throw new Error('sin actuación');
    const documentos = crearRepositorioDeDocumentos(baseDeDatos.paraDespacho);
    const referencias = [
      { idExterno: 'd1', nombre: 'auto.pdf', fechaCarga: null, urlOrigen: 'https://p.test/d1' },
      { idExterno: 'd2', nombre: 'memorial.pdf', fechaCarga: null, urlOrigen: 'https://p.test/d2' },
    ];
    await documentos.registrarReferencias(a.despachoId, guardada.id, referencias);
    await documentos.registrarReferencias(a.despachoId, guardada.id, referencias);

    expect(await documentos.actuacionDeOrigen(a.despachoId, guardada.id)).toEqual({
      plataforma: 'RAMA_CPNU',
      idExterno: '50',
    });
    const pendientes = await documentos.pendientes(a.despachoId, guardada.id);
    expect(pendientes.map((d) => d.idExterno)).toEqual(['d1', 'd2']);
    const [d1, d2] = pendientes;
    if (!d1 || !d2) throw new Error('faltan documentos');

    await documentos.marcarDescargado(a.despachoId, d1.id, {
      ruta: `${a.despachoId}/ab/${'a'.repeat(64)}`,
      sha256: 'a'.repeat(64),
      tamanoBytes: 1234,
      tipoMime: 'application/pdf',
      ahora: new Date(),
    });
    await documentos.marcarNoDisponible(a.despachoId, d2.id, new Date());

    expect(await documentos.pendientes(a.despachoId, guardada.id)).toHaveLength(1);
    expect(await documentos.paraAbrir(a.despachoId, d1.id)).toMatchObject({
      procesoId,
      tipoMime: 'application/pdf',
      tamanoBytes: 1234,
    });
    // Uno no disponible no se abre; ni el de otro despacho.
    expect(await documentos.paraAbrir(a.despachoId, d2.id)).toBeNull();
    expect(await documentos.paraAbrir(b.despachoId, d1.id)).toBeNull();
    expect(await documentos.actuacionDeOrigen(b.despachoId, guardada.id)).toBeNull();
  });
});

describe('cola de pg-boss', () => {
  let boss: PgBoss;
  let cola: ReturnType<typeof crearColaDeTrabajos>;
  const COLAS = { sincronizables: ['RAMA_CPNU'], conDocumentos: ['RAMA_CPNU'] } as const;

  beforeAll(async () => {
    boss = new PgBoss({
      connectionString: inject('urlBaseDeDatosPruebas'),
      supervise: false,
      schedule: false,
    });
    await boss.start();
    await asegurarColas(boss, COLAS);
    await asegurarColas(boss, COLAS); // idempotente
    cola = crearColaDeTrabajos(() => Promise.resolve(boss));
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
  });

  it('«Consultar ahora» repetido reutiliza el trabajo en espera en vez de crear otro', async () => {
    const solicitud = {
      despachoId: a.despachoId,
      procesoId: await procesoNuevo(a.despachoId),
      plataforma: 'RAMA_CPNU',
    } as const;
    const primero = await cola.encolarSincronizacion(solicitud, 'NORMAL');
    const segundo = await cola.encolarSincronizacion(solicitud, 'ALTA');
    const tercero = await cola.encolarSincronizacion(solicitud, 'NORMAL');
    expect(segundo).toBe(primero);
    expect(tercero).toBe(primero);

    const trabajo = await boss.getJobById(NOMBRES_DE_COLA.sincronizar('RAMA_CPNU'), primero);
    expect(trabajo?.priority).toBe(10);
    expect(await cola.estadoDeSincronizacion('RAMA_CPNU', primero)).toEqual({
      despachoId: a.despachoId,
      procesoId: solicitud.procesoId,
      estado: { estado: 'EN_COLA' },
    });
  });

  it('el lote programado omite los procesos que ya tienen un trabajo en espera', async () => {
    const p1 = await procesoNuevo(a.despachoId);
    const p2 = await procesoNuevo(a.despachoId);
    await cola.encolarSincronizacion(
      { despachoId: a.despachoId, procesoId: p1, plataforma: 'RAMA_CPNU' },
      'ALTA',
    );
    const creados = await cola.encolarSincronizaciones([
      { despachoId: a.despachoId, procesoId: p1, plataforma: 'RAMA_CPNU' },
      { despachoId: a.despachoId, procesoId: p2, plataforma: 'RAMA_CPNU' },
    ]);
    expect(creados).toBe(1);
  });

  it('lee el resultado de un trabajo terminado; un id ajeno o inválido no da nada', async () => {
    const procesoId = await procesoNuevo(a.despachoId);
    const nombre = NOMBRES_DE_COLA.sincronizar('RAMA_CPNU');
    await cola.encolarSincronizacion(
      { despachoId: a.despachoId, procesoId, plataforma: 'RAMA_CPNU' },
      'ALTA',
    );
    // Toma el de mayor prioridad (alguno de los encolados con ALTA) y lo completa.
    const [trabajo] = await boss.fetch(nombre);
    if (!trabajo) throw new Error('sin trabajo');
    const resumen = {
      tipo: 'SINCRONIZADO',
      nuevas: 3,
      total: 73,
      cargaInicial: false,
      reservado: false,
    };
    await boss.complete(nombre, trabajo.id, resumen);

    const estado = await cola.estadoDeSincronizacion('RAMA_CPNU', trabajo.id);
    expect(estado?.estado).toEqual({ estado: 'TERMINADO', resumen });
    expect(await cola.estadoDeSincronizacion('RAMA_CPNU', 'no-es-un-id')).toBeNull();
    expect(
      await cola.estadoDeSincronizacion('RAMA_CPNU', '00000000-0000-7000-8000-000000000999'),
    ).toBeNull();
  });
});
