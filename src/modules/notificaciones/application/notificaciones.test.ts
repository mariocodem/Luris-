import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import { contarItems } from '@/modules/plataformas/domain/consulta-masiva';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { ActuacionAvisada, Aviso, CanalDeAviso } from '../domain/aviso';
import { ErrorDeEnvio, type Notificador } from '../domain/notificador';
import {
  esquemaDePreferencias,
  PREFERENCIAS_POR_DEFECTO,
  type PreferenciasDeNotificacion,
} from '../domain/preferencias';
import { INTENTOS_DE_ENVIO } from '../domain/programacion';
import { agruparPorProceso, crearDespacharNotificaciones } from './despachar-notificaciones';
import { crearGuardarPreferencias, crearObtenerPreferencias } from './preferencias';
import { crearProgramarNotificaciones } from './programar-notificaciones';
import type {
  DestinatarioPosible,
  LoteTerminadoSinAviso,
  NotificacionAProgramar,
  NotificacionPorEnviar,
  RepositorioDeNotificaciones,
  RepositorioDeSesionDeWhatsapp,
  SesionDeWhatsapp,
} from './puertos';
import { SESION_SIN_VINCULAR } from './puertos';
import {
  crearDesvincularWhatsapp,
  crearObtenerEstadoDeWhatsapp,
  crearVincularWhatsapp,
} from './whatsapp';

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};
const AHORA = new Date('2026-11-18T15:00:00Z');
const reloj = { ahora: () => AHORA };

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

const CON_WHATSAPP: PreferenciasDeNotificacion = {
  correoActivo: true,
  whatsappActivo: true,
  numeroWhatsapp: '573001234567',
  consentimientoWhatsappEn: new Date('2026-01-01T00:00:00Z'),
  frecuencia: 'INMEDIATA',
};

// ─── Repositorio en memoria ───────────────────────────────────────────────────

interface Fila {
  id: string;
  clave: string;
  membresiaId: string;
  canal: CanalDeAviso;
  actuacionId: string;
  procesoId: string;
  estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  intentos: number;
  codigoError: string | null;
  programadaPara: Date;
  enviadaEn: Date | null;
}

function actuacion(id: string, dia: string): ActuacionAvisada {
  return {
    id,
    plataforma: 'RAMA_CPNU',
    origen: null,
    fechaActuacion: new Date(`${dia}T00:00:00Z`),
    fechaRegistro: new Date(`${dia}T00:00:00Z`),
    descripcion: `Actuación ${id}`,
    anotacion: null,
    tieneDocumentos: false,
  };
}

function crearRepositorio(opciones: {
  destinatarios?: DestinatarioPosible[];
  lotes?: LoteTerminadoSinAviso[];
  preferencias?: Map<string, PreferenciasDeNotificacion>;
}) {
  const filas: Fila[] = [];
  const lotesAvisados: string[] = [];
  const actuaciones = new Map<string, ActuacionAvisada & { procesoId: string }>();
  const personas = new Map<string, DestinatarioPosible>();
  for (const d of opciones.destinatarios ?? []) personas.set(d.membresiaId, d);
  const guardadas = opciones.preferencias ?? new Map<string, PreferenciasDeNotificacion>();

  const repositorio: RepositorioDeNotificaciones = {
    async destinatariosDeProceso() {
      return opciones.destinatarios ?? [];
    },
    async programar(_d, nuevas: readonly NotificacionAProgramar[]) {
      let creadas = 0;
      for (const n of nuevas) {
        const clave = `${n.actuacionId}|${n.membresiaId}|${n.canal}`;
        if (filas.some((f) => f.clave === clave)) continue;
        filas.push({
          id: `n${filas.length + 1}`,
          clave,
          membresiaId: n.membresiaId,
          canal: n.canal,
          actuacionId: n.actuacionId,
          procesoId: actuaciones.get(n.actuacionId)?.procesoId ?? 'p1',
          estado: 'PENDIENTE',
          intentos: 0,
          codigoError: null,
          programadaPara: n.programadaPara,
          enviadaEn: null,
        });
        creadas += 1;
      }
      return creadas;
    },
    async reclamarVencidas(_d, { ahora, limite, arriendoMs }) {
      const vencidas = filas
        .filter((f) => f.estado === 'PENDIENTE' && f.programadaPara <= ahora)
        .slice(0, limite);
      return vencidas.map((f): NotificacionPorEnviar => {
        f.intentos += 1;
        f.programadaPara = new Date(ahora.getTime() + arriendoMs);
        const persona = personas.get(f.membresiaId);
        const act = actuaciones.get(f.actuacionId) as ActuacionAvisada & { procesoId: string };
        return {
          id: f.id,
          membresiaId: f.membresiaId,
          canal: f.canal,
          intentos: f.intentos,
          destinatario: {
            nombre: persona?.nombre ?? 'Alguien',
            email: persona?.email ?? 'alguien@demo.test',
            preferencias:
              guardadas.get(f.membresiaId) ?? persona?.preferencias ?? PREFERENCIAS_POR_DEFECTO,
          },
          proceso: {
            procesoId: f.procesoId,
            alias: `Proceso ${f.procesoId}`,
            cliente: null,
            radicado: '50001400300120210034300',
            nunc: null,
          },
          actuacion: act,
        };
      });
    },
    async marcarEnviadas(_d, ids, ahora) {
      for (const f of filas.filter((x) => ids.includes(x.id))) {
        f.estado = 'ENVIADA';
        f.enviadaEn = ahora;
      }
    },
    async marcarFallidas(_d, ids, codigo) {
      for (const f of filas.filter((x) => ids.includes(x.id))) {
        f.estado = 'FALLIDA';
        f.codigoError = codigo;
      }
    },
    async reprogramar(_d, ids, para, codigo) {
      for (const f of filas.filter((x) => ids.includes(x.id))) {
        f.programadaPara = para;
        f.codigoError = codigo;
      }
    },
    async deLaPersona() {
      return [];
    },
    async lotesTerminadosSinAviso() {
      return (opciones.lotes ?? []).filter((l) => !lotesAvisados.includes(l.consultaId));
    },
    async marcarLoteAvisado(_d, id) {
      lotesAvisados.push(id);
    },
    async obtenerPreferencias(_d, membresiaId) {
      return guardadas.get(membresiaId) ?? null;
    },
    async guardarPreferencias(_d, membresiaId, p) {
      guardadas.set(membresiaId, p);
    },
  };
  return {
    repositorio,
    filas,
    lotesAvisados,
    guardadas,
    registrarActuacion(a: ActuacionAvisada, procesoId = 'p1') {
      actuaciones.set(a.id, { ...a, procesoId });
    },
  };
}

function crearNotificador(canal: CanalDeAviso, resultados: ('ok' | ErrorDeEnvio)[] = []) {
  const enviados: Aviso[] = [];
  const notificador: Notificador = {
    canal,
    async enviar(aviso) {
      enviados.push(aviso);
      const siguiente = resultados.shift() ?? 'ok';
      return siguiente === 'ok' ? ok(undefined) : err(siguiente);
    },
  };
  return { notificador, enviados };
}

const persona = (id: string, preferencias = PREFERENCIAS_POR_DEFECTO): DestinatarioPosible => ({
  membresiaId: id,
  nombre: `Persona ${id}`,
  email: `${id}@demo.test`,
  preferencias,
});

// ─── Programar ────────────────────────────────────────────────────────────────

describe('programarNotificaciones', () => {
  function programador(destinatarios: DestinatarioPosible[]) {
    const repo = crearRepositorio({ destinatarios });
    const programar = crearProgramarNotificaciones({
      repositorio: repo.repositorio,
      reloj,
      horaDelResumen: 7,
      logger: silencioso,
    });
    return { ...repo, programar };
  }

  it('programa un aviso por actuación, persona y canal activo', async () => {
    const { programar, filas } = programador([
      persona('m1'),
      persona('m2', CON_WHATSAPP),
      persona('m3', { ...PREFERENCIAS_POR_DEFECTO, correoActivo: false }),
    ]);
    const creadas = await programar({
      despachoId: DESPACHO.id,
      procesoId: 'p1',
      actuacionIds: ['a1', 'a2'],
    });
    // m1: correo × 2; m2: correo y WhatsApp × 2; m3: nada.
    expect(creadas).toBe(6);
    expect(
      filas
        .filter((f) => f.membresiaId === 'm2')
        .map((f) => f.canal)
        .sort(),
    ).toEqual(['CORREO', 'CORREO', 'WHATSAPP', 'WHATSAPP']);
    expect(filas.some((f) => f.membresiaId === 'm3')).toBe(false);
    expect(filas.every((f) => f.programadaPara.getTime() === AHORA.getTime())).toBe(true);
  });

  it('es idempotente: repetir no duplica avisos', async () => {
    const { programar, filas } = programador([persona('m1')]);
    const solicitud = { despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] };
    expect(await programar(solicitud)).toBe(1);
    expect(await programar(solicitud)).toBe(0);
    expect(filas).toHaveLength(1);
  });

  it('el resumen diario sale a la hora del resumen, no de inmediato', async () => {
    const { programar, filas } = programador([
      persona('m1', { ...PREFERENCIAS_POR_DEFECTO, frecuencia: 'RESUMEN_DIARIO' }),
    ]);
    await programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    // AHORA = 10:00 en Bogotá; el resumen de las 7:00 sale mañana.
    expect(filas[0]?.programadaPara).toEqual(new Date('2026-11-19T12:00:00Z'));
  });

  it('WhatsApp sin número o sin consentimiento no se programa', async () => {
    const { programar, filas } = programador([
      persona('m1', { ...CON_WHATSAPP, consentimientoWhatsappEn: null }),
      persona('m2', { ...CON_WHATSAPP, numeroWhatsapp: null }),
    ]);
    await programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    expect(filas.filter((f) => f.canal === 'WHATSAPP')).toHaveLength(0);
  });

  it('sin actuaciones o sin destinatarios no hace nada', async () => {
    expect(
      await programador([persona('m1')]).programar({
        despachoId: DESPACHO.id,
        procesoId: 'p1',
        actuacionIds: [],
      }),
    ).toBe(0);
    expect(
      await programador([]).programar({
        despachoId: DESPACHO.id,
        procesoId: 'p1',
        actuacionIds: ['a1'],
      }),
    ).toBe(0);
  });
});

// ─── Despachar ────────────────────────────────────────────────────────────────

describe('despacharNotificaciones', () => {
  function escenario(opciones: {
    destinatarios?: DestinatarioPosible[];
    preferencias?: Map<string, PreferenciasDeNotificacion>;
    correo?: ('ok' | ErrorDeEnvio)[];
    whatsapp?: ('ok' | ErrorDeEnvio)[];
    lotes?: LoteTerminadoSinAviso[];
    sinWhatsapp?: boolean;
    ahora?: () => Date;
  }) {
    const repo = crearRepositorio(opciones);
    const correo = crearNotificador('CORREO', opciones.correo);
    const whatsapp = crearNotificador('WHATSAPP', opciones.whatsapp);
    const notificadores = new Map<CanalDeAviso, Notificador>([['CORREO', correo.notificador]]);
    if (!opciones.sinWhatsapp) notificadores.set('WHATSAPP', whatsapp.notificador);
    const reloj2 = opciones.ahora ? { ahora: opciones.ahora } : reloj;
    const despachar = crearDespacharNotificaciones({
      repositorio: repo.repositorio,
      notificadores,
      despachosActivos: async () => [DESPACHO.id],
      urlBase: 'https://luris.test',
      reloj: reloj2,
      logger: silencioso,
    });
    const programar = crearProgramarNotificaciones({
      repositorio: repo.repositorio,
      reloj: reloj2,
      horaDelResumen: 7,
      logger: silencioso,
    });
    return { ...repo, correo, whatsapp, despachar, programar };
  }

  it('una actuación nueva genera exactamente un correo y un WhatsApp con las fechas oficiales', async () => {
    const e = escenario({ destinatarios: [persona('m1', CON_WHATSAPP)] });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });

    const resumen = await e.despachar();
    expect(resumen).toMatchObject({ enviadas: 2, reprogramadas: 0, fallidas: 0 });
    expect(e.correo.enviados).toHaveLength(1);
    expect(e.whatsapp.enviados).toHaveLength(1);
    const aviso = e.correo.enviados[0];
    expect(
      aviso?.tipo === 'ACTUACIONES' && aviso.procesos[0]?.actuaciones[0]?.fechaActuacion,
    ).toEqual(new Date('2026-10-21T00:00:00Z'));
    expect(e.filas.every((f) => f.estado === 'ENVIADA')).toBe(true);

    // Otra pasada, y otra programación de lo mismo: nada se vuelve a enviar.
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    await e.despachar();
    expect(e.correo.enviados).toHaveLength(1);
    expect(e.whatsapp.enviados).toHaveLength(1);
  });

  it('agrupa las actuaciones de un mismo proceso en un solo aviso y separa los procesos', async () => {
    const e = escenario({ destinatarios: [persona('m1')] });
    e.registrarActuacion(actuacion('a1', '2026-10-21'), 'p1');
    e.registrarActuacion(actuacion('a2', '2026-10-25'), 'p1');
    e.registrarActuacion(actuacion('a3', '2026-10-26'), 'p2');
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1', 'a2'] });
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p2', actuacionIds: ['a3'] });
    await e.despachar();
    expect(e.correo.enviados).toHaveLength(2);
    const [primero, segundo] = e.correo.enviados;
    expect(
      primero?.tipo === 'ACTUACIONES' && primero.procesos[0]?.actuaciones.map((a) => a.id),
    ).toEqual(['a2', 'a1']);
    expect(segundo?.tipo === 'ACTUACIONES' && segundo.procesos).toHaveLength(1);
  });

  it('en resumen diario, un solo aviso con todos los procesos, solo a la hora del resumen', async () => {
    let ahora = AHORA;
    const preferencias = new Map([
      ['m1', { ...PREFERENCIAS_POR_DEFECTO, frecuencia: 'RESUMEN_DIARIO' as const }],
    ]);
    const e = escenario({
      destinatarios: [persona('m1', preferencias.get('m1'))],
      preferencias,
      ahora: () => ahora,
    });
    e.registrarActuacion(actuacion('a1', '2026-10-21'), 'p1');
    e.registrarActuacion(actuacion('a3', '2026-10-26'), 'p2');
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p2', actuacionIds: ['a3'] });

    await e.despachar();
    expect(e.correo.enviados).toHaveLength(0);

    ahora = new Date('2026-11-19T12:00:30Z');
    await e.despachar();
    expect(e.correo.enviados).toHaveLength(1);
    const aviso = e.correo.enviados[0];
    expect(aviso?.tipo === 'ACTUACIONES' && aviso.modo).toBe('RESUMEN_DIARIO');
    expect(aviso?.tipo === 'ACTUACIONES' && aviso.procesos).toHaveLength(2);
  });

  it('un fallo pasajero se reintenta con espera creciente y al final se da por fallido', async () => {
    let ahora = AHORA;
    const e = escenario({
      destinatarios: [persona('m1')],
      correo: Array.from(
        { length: INTENTOS_DE_ENVIO + 2 },
        () => new ErrorDeEnvio('FALLO_TEMPORAL'),
      ),
      ahora: () => ahora,
    });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });

    const esperas: number[] = [];
    for (let intento = 1; intento <= INTENTOS_DE_ENVIO; intento += 1) {
      const resumen = await e.despachar();
      const fila = e.filas[0];
      if (!fila) throw new Error('sin fila');
      if (intento < INTENTOS_DE_ENVIO) {
        expect(resumen.reprogramadas).toBe(1);
        expect(fila).toMatchObject({ estado: 'PENDIENTE', codigoError: 'FALLO_TEMPORAL' });
        esperas.push((fila.programadaPara.getTime() - ahora.getTime()) / 60_000);
        ahora = new Date(fila.programadaPara.getTime() + 1000);
      } else {
        expect(resumen.fallidas).toBe(1);
      }
    }
    expect(esperas).toEqual([1, 2, 4, 8]);
    expect(e.filas[0]).toMatchObject({ estado: 'FALLIDA', intentos: INTENTOS_DE_ENVIO });
  });

  it('un fallo definitivo no se reintenta', async () => {
    const e = escenario({
      destinatarios: [persona('m1')],
      correo: [new ErrorDeEnvio('DESTINO_INVALIDO')],
    });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    expect(await e.despachar()).toMatchObject({ fallidas: 1, reprogramadas: 0 });
    expect(e.filas[0]).toMatchObject({ estado: 'FALLIDA', codigoError: 'DESTINO_INVALIDO' });
  });

  it('si la persona apagó el canal antes de que saliera, no se envía', async () => {
    const preferencias = new Map<string, PreferenciasDeNotificacion>();
    const e = escenario({ destinatarios: [persona('m1', CON_WHATSAPP)], preferencias });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    // Entre programar y despachar, apaga WhatsApp.
    preferencias.set('m1', { ...CON_WHATSAPP, whatsappActivo: false });
    await e.despachar();
    expect(e.whatsapp.enviados).toHaveLength(0);
    expect(e.filas.find((f) => f.canal === 'WHATSAPP')).toMatchObject({
      estado: 'FALLIDA',
      codigoError: 'CANAL_DESACTIVADO',
    });
    expect(e.correo.enviados).toHaveLength(1);
  });

  it('un canal que el servidor no tiene se reintenta como no disponible', async () => {
    const e = escenario({ destinatarios: [persona('m1', CON_WHATSAPP)], sinWhatsapp: true });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    await e.despachar();
    expect(e.filas.find((f) => f.canal === 'WHATSAPP')).toMatchObject({
      estado: 'PENDIENTE',
      codigoError: 'CANAL_NO_DISPONIBLE',
    });
    expect(e.filas.find((f) => f.canal === 'CORREO')?.estado).toBe('ENVIADA');
  });

  it('un aviso arrendado no lo toma otra pasada mientras se envía', async () => {
    const e = escenario({ destinatarios: [persona('m1')] });
    e.registrarActuacion(actuacion('a1', '2026-10-21'));
    await e.programar({ despachoId: DESPACHO.id, procesoId: 'p1', actuacionIds: ['a1'] });
    const opciones = { ahora: AHORA, limite: 10, arriendoMs: 600_000 };
    expect(await e.repositorio.reclamarVencidas(DESPACHO.id, opciones)).toHaveLength(1);
    expect(await e.repositorio.reclamarVencidas(DESPACHO.id, opciones)).toHaveLength(0);
  });

  it('avisa una sola vez cuando terminó una consulta masiva', async () => {
    const lote: LoteTerminadoSinAviso = {
      consultaId: 'c1',
      destinatario: { nombre: 'Laura', email: 'laura@demo.test', preferencias: CON_WHATSAPP },
      procesos: 400,
      conteo: contarItems(['COMPLETADO', 'COMPLETADO', 'FALLIDO']),
    };
    const e = escenario({ lotes: [lote] });
    expect(await e.despachar()).toMatchObject({ lotesAvisados: 1 });
    expect(await e.despachar()).toMatchObject({ lotesAvisados: 0 });
    expect(e.correo.enviados[0]).toMatchObject({
      tipo: 'CONSULTA_MASIVA',
      listos: 2,
      conProblemas: 1,
      procesos: 400,
    });
    expect(e.whatsapp.enviados).toHaveLength(1);
    expect(e.lotesAvisados).toEqual(['c1']);
  });

  it('si el aviso de la consulta masiva falla por algo pasajero, se reintenta en la siguiente pasada', async () => {
    const lote: LoteTerminadoSinAviso = {
      consultaId: 'c1',
      destinatario: {
        nombre: 'Laura',
        email: 'laura@demo.test',
        preferencias: PREFERENCIAS_POR_DEFECTO,
      },
      procesos: 3,
      conteo: contarItems(['COMPLETADO']),
    };
    const e = escenario({ lotes: [lote], correo: [new ErrorDeEnvio('FALLO_TEMPORAL')] });
    expect(await e.despachar()).toMatchObject({ lotesAvisados: 0 });
    expect(await e.despachar()).toMatchObject({ lotesAvisados: 1 });
    expect(e.correo.enviados).toHaveLength(2);
  });

  it('agruparPorProceso ordena las actuaciones de la más reciente a la más antigua', () => {
    const filas = ['2026-10-01', '2026-10-09', '2026-10-05'].map((dia, i) => ({
      actuacion: actuacion(`a${i}`, dia),
      proceso: { procesoId: 'p1', alias: null, cliente: null, radicado: null, nunc: null },
    })) as unknown as NotificacionPorEnviar[];
    expect(agruparPorProceso(filas)[0]?.actuaciones.map((a) => a.id)).toEqual(['a1', 'a2', 'a0']);
  });
});

// ─── Preferencias ─────────────────────────────────────────────────────────────

describe('preferencias de notificación', () => {
  function casos() {
    const repo = crearRepositorio({});
    const auditoria: EventoDeAuditoria[] = [];
    return {
      repo,
      auditoria,
      obtener: crearObtenerPreferencias({ repositorio: repo.repositorio }),
      guardar: crearGuardarPreferencias({
        repositorio: repo.repositorio,
        auditoria: {
          registrar: async (e) => {
            auditoria.push(e);
          },
        },
        reloj,
      }),
    };
  }

  it('sin preferencias guardadas, las de por defecto', async () => {
    const r = await casos().obtener(sesion('abogado'));
    expect(r.ok && r.value.preferencias).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(r.ok && r.value.email).toBe('abogado@demo.test');
  });

  it('guarda las de quien las envía y audita sin el número', async () => {
    const c = casos();
    const entrada = esquemaDePreferencias.parse({
      correoActivo: true,
      whatsappActivo: true,
      numeroWhatsapp: '300 123 4567',
      consentimientoWhatsapp: true,
      frecuencia: 'RESUMEN_DIARIO',
    });
    const r = await c.guardar(sesion('asistente', 'm-asis'), { entrada, ip: '10.0.0.1' });
    expect(r.ok).toBe(true);
    expect(c.repo.guardadas.get('m-asis')).toMatchObject({
      numeroWhatsapp: '573001234567',
      frecuencia: 'RESUMEN_DIARIO',
    });
    expect(c.auditoria[0]?.accion).toBe('NOTIFICACIONES_PREFERENCIAS_ACTUALIZADAS');
    expect(JSON.stringify(c.auditoria[0])).not.toContain('573001234567');
  });

  it('el superadmin no tiene preferencias de despacho', async () => {
    const r = await casos().obtener({
      usuarioId: 'u',
      nombre: 's',
      email: 's@x.co',
      perfil: 'superadmin',
      despacho: null,
      membresiaId: null,
    });
    expect(r.ok).toBe(false);
  });
});

// ─── WhatsApp del despacho ────────────────────────────────────────────────────

describe('WhatsApp del despacho', () => {
  function crearSesiones(inicial: SesionDeWhatsapp = SESION_SIN_VINCULAR) {
    let actual = inicial;
    const llamadas: string[] = [];
    const sesiones: RepositorioDeSesionDeWhatsapp = {
      async obtener() {
        return actual;
      },
      async solicitarVinculacion(_d, ahora) {
        llamadas.push('solicitar');
        actual = { ...SESION_SIN_VINCULAR, estado: 'VINCULANDO', vinculacionSolicitadaEn: ahora };
      },
      async actualizar() {},
      async cargarDatos() {
        return null;
      },
      async guardarDatos() {},
      async reiniciar() {
        llamadas.push('reiniciar');
        actual = SESION_SIN_VINCULAR;
      },
      async despachosConSesion() {
        return [];
      },
    };
    return {
      sesiones,
      llamadas,
      poner: (s: SesionDeWhatsapp) => {
        actual = s;
      },
    };
  }

  const cifrador = {
    cifrar: (texto: string) => ({ datos: new TextEncoder().encode(texto), version: 1 }),
    descifrar: (secreto: { datos: Uint8Array }) => new TextDecoder().decode(secreto.datos),
  };

  function dependencias(inicial?: SesionDeWhatsapp, conCifrador = true) {
    const s = crearSesiones(inicial);
    const ordenes: string[] = [];
    const auditoria: EventoDeAuditoria[] = [];
    return {
      s,
      ordenes,
      auditoria,
      deps: {
        sesiones: s.sesiones,
        cola: {
          async encolarVinculacion(d: string) {
            ordenes.push(`vincular:${d}`);
          },
          async encolarDesvinculacion(d: string) {
            ordenes.push(`desvincular:${d}`);
          },
        },
        cifrador: conCifrador ? cifrador : null,
        auditoria: {
          registrar: async (e: EventoDeAuditoria) => {
            auditoria.push(e);
          },
        },
        reloj,
      },
    };
  }

  it('solo el administrador gestiona el WhatsApp del despacho', async () => {
    const { deps } = dependencias();
    for (const rol of ['abogado', 'asistente'] as const) {
      const r = await crearVincularWhatsapp(deps)(sesion(rol), { ip: null });
      expect(!r.ok && r.error.codigo).toBe('SIN_PERMISO');
      expect((await crearObtenerEstadoDeWhatsapp(deps)(sesion(rol))).ok).toBe(false);
      expect((await crearDesvincularWhatsapp(deps)(sesion(rol), { ip: null })).ok).toBe(false);
    }
  });

  it('vincular pide al worker que empiece y lo audita', async () => {
    const { deps, ordenes, auditoria } = dependencias();
    const r = await crearVincularWhatsapp(deps)(sesion('administrador'), { ip: '10.0.0.1' });
    expect(r.ok).toBe(true);
    expect(ordenes).toEqual([`vincular:${DESPACHO.id}`]);
    expect(auditoria[0]?.accion).toBe('WHATSAPP_VINCULACION_SOLICITADA');
  });

  it('sin la clave de cifrado no se vincula y se explica qué falta', async () => {
    const { deps, ordenes } = dependencias(undefined, false);
    const r = await crearVincularWhatsapp(deps)(sesion('administrador'), { ip: null });
    expect(!r.ok && r.error.mensajeUsuario).toContain('clave');
    expect(ordenes).toEqual([]);
  });

  it('si ya está vinculado, hay que desvincular antes', async () => {
    const { deps } = dependencias({
      ...SESION_SIN_VINCULAR,
      estado: 'CONECTADA',
      numero: '573001234567',
    });
    const r = await crearVincularWhatsapp(deps)(sesion('administrador'), { ip: null });
    expect(!r.ok && r.error.mensajeUsuario).toContain('Desvincúlalo primero');
  });

  it('muestra el QR solo mientras es vigente, descifrado', async () => {
    const { deps, s } = dependencias();
    const estado = crearObtenerEstadoDeWhatsapp(deps);
    s.poner({
      ...SESION_SIN_VINCULAR,
      estado: 'VINCULANDO',
      qr: cifrador.cifrar('2@qr-de-prueba'),
      qrGeneradoEn: new Date(AHORA.getTime() - 20_000),
      vinculacionSolicitadaEn: new Date(AHORA.getTime() - 25_000),
    });
    const vigente = await estado(sesion('administrador'));
    expect(vigente.ok && vigente.value.qr).toBe('2@qr-de-prueba');
    expect(vigente.ok && vigente.value.disponible).toBe(true);

    s.poner({
      ...SESION_SIN_VINCULAR,
      estado: 'VINCULANDO',
      qr: cifrador.cifrar('2@viejo'),
      qrGeneradoEn: new Date(AHORA.getTime() - 120_000),
      vinculacionSolicitadaEn: new Date(AHORA.getTime() - 130_000),
    });
    const vencido = await estado(sesion('administrador'));
    expect(vencido.ok && vencido.value.qr).toBeNull();
    expect(vencido.ok && vencido.value.sinRespuesta).toBe(true);
  });

  it('desvincular avisa al worker, limpia la sesión y lo audita', async () => {
    const { deps, ordenes, s, auditoria } = dependencias({
      ...SESION_SIN_VINCULAR,
      estado: 'CONECTADA',
    });
    const r = await crearDesvincularWhatsapp(deps)(sesion('administrador'), { ip: null });
    expect(r.ok).toBe(true);
    expect(ordenes).toEqual([`desvincular:${DESPACHO.id}`]);
    expect(s.llamadas).toContain('reiniciar');
    expect(auditoria[0]?.accion).toBe('WHATSAPP_DESVINCULADO');
  });
});
