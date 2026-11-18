import type { Logger } from '@/shared/domain/logger';
import {
  type Aviso,
  type AvisoDeActuaciones,
  type CanalDeAviso,
  type ProcesoAvisado,
} from '../domain/aviso';
import { ErrorDeEnvio, type Notificador } from '../domain/notificador';
import { esperaDeReintentoMs, INTENTOS_DE_ENVIO } from '../domain/programacion';
import type { PreferenciasDeNotificacion } from '../domain/preferencias';
import type {
  LoteTerminadoSinAviso,
  NotificacionPorEnviar,
  Reloj,
  RepositorioDeNotificaciones,
} from './puertos';

/** Cuánto se «arrienda» un aviso mientras se envía (si el worker cae, se reintenta después). */
const ARRIENDO_MS = 10 * 60_000;
const AVISOS_POR_TANDA = 200;
/** Las consultas masivas terminadas hace más que esto ya no se avisan. */
const HORAS_PARA_AVISAR_UN_LOTE = 24;

export interface DependenciasDeDespacho {
  readonly repositorio: RepositorioDeNotificaciones;
  readonly notificadores: ReadonlyMap<CanalDeAviso, Notificador>;
  /** Despachos activos (no suspendidos). */
  readonly despachosActivos: () => Promise<readonly string[]>;
  readonly urlBase: string;
  readonly reloj: Reloj;
  readonly logger: Logger;
}

export interface ResumenDeDespacho {
  readonly enviadas: number;
  readonly reprogramadas: number;
  readonly fallidas: number;
  readonly lotesAvisados: number;
}

function canalActivo(canal: CanalDeAviso, p: PreferenciasDeNotificacion): boolean {
  return canal === 'CORREO'
    ? p.correoActivo
    : p.whatsappActivo && p.numeroWhatsapp !== null && p.consentimientoWhatsappEn !== null;
}

/** Procesos con sus actuaciones nuevas (las más recientes primero), en el orden en que llegaron. */
export function agruparPorProceso(filas: readonly NotificacionPorEnviar[]): ProcesoAvisado[] {
  const porProceso = new Map<
    string,
    ProcesoAvisado & { actuaciones: ProcesoAvisado['actuaciones'][number][] }
  >();
  for (const fila of filas) {
    const existente = porProceso.get(fila.proceso.procesoId);
    if (existente) existente.actuaciones.push(fila.actuacion);
    else porProceso.set(fila.proceso.procesoId, { ...fila.proceso, actuaciones: [fila.actuacion] });
  }
  return [...porProceso.values()].map((p) => ({
    ...p,
    actuaciones: [...p.actuaciones].sort(
      (a, b) => b.fechaActuacion.getTime() - a.fechaActuacion.getTime(),
    ),
  }));
}

/**
 * Despachador de avisos (§9). Cada pasada, por despacho:
 * 1. toma los avisos que ya vencen (los arrienda, para no enviarlos dos veces a la vez);
 * 2. los agrupa por persona y canal: en «de inmediato», un aviso por proceso con todas sus
 *    actuaciones nuevas; en resumen diario, uno solo con todos los procesos;
 * 3. los envía por su canal y deja cada uno enviado, reprogramado (fallo pasajero, con espera
 *    creciente) o fallido (definitivo o sin intentos).
 * Luego avisa de las consultas masivas que terminaron (§7).
 */
export function crearDespacharNotificaciones(deps: DependenciasDeDespacho) {
  async function enviarGrupo(
    despachoId: string,
    canal: CanalDeAviso,
    filas: readonly NotificacionPorEnviar[],
    totales: { enviadas: number; reprogramadas: number; fallidas: number },
  ): Promise<void> {
    const primera = filas[0];
    if (!primera) return;
    const { destinatario } = primera;
    const ids = filas.map((f) => f.id);

    if (!canalActivo(canal, destinatario.preferencias)) {
      await deps.repositorio.marcarFallidas(despachoId, ids, 'CANAL_DESACTIVADO');
      totales.fallidas += ids.length;
      return;
    }
    const notificador = deps.notificadores.get(canal);

    const resumen = destinatario.preferencias.frecuencia === 'RESUMEN_DIARIO';
    const porProceso = agruparPorProceso(filas);
    const avisos: { aviso: AvisoDeActuaciones; filas: readonly NotificacionPorEnviar[] }[] = resumen
      ? [{ aviso: armarAviso(deps.urlBase, filas, porProceso, true), filas }]
      : porProceso.map((proceso) => {
          const deEste = filas.filter((f) => f.proceso.procesoId === proceso.procesoId);
          return { aviso: armarAviso(deps.urlBase, deEste, [proceso], false), filas: deEste };
        });

    for (const { aviso, filas: deAviso } of avisos) {
      const idsDelAviso = deAviso.map((f) => f.id);
      const resultado = notificador
        ? await notificador.enviar(aviso, { despachoId })
        : { ok: false as const, error: new ErrorDeEnvio('CANAL_NO_DISPONIBLE', `Sin ${canal}`) };
      if (resultado.ok) {
        await deps.repositorio.marcarEnviadas(despachoId, idsDelAviso, deps.reloj.ahora());
        totales.enviadas += idsDelAviso.length;
        continue;
      }
      const intentos = Math.max(...deAviso.map((f) => f.intentos));
      const codigo = resultado.error.codigoDeEnvio;
      deps.logger.warn('No se pudo enviar un aviso', {
        despachoId,
        canal,
        codigo,
        intentos,
        detalle: resultado.error.detalleTecnico,
      });
      if (resultado.error.transitorio && intentos < INTENTOS_DE_ENVIO) {
        const para = new Date(deps.reloj.ahora().getTime() + esperaDeReintentoMs(intentos));
        await deps.repositorio.reprogramar(despachoId, idsDelAviso, para, codigo);
        totales.reprogramadas += idsDelAviso.length;
      } else {
        await deps.repositorio.marcarFallidas(despachoId, idsDelAviso, codigo);
        totales.fallidas += idsDelAviso.length;
      }
    }
  }

  async function avisarLote(despachoId: string, lote: LoteTerminadoSinAviso): Promise<boolean> {
    const { destinatario, conteo } = lote;
    const canales = (['CORREO', 'WHATSAPP'] as const).filter((c) =>
      canalActivo(c, destinatario.preferencias),
    );
    const aviso: Aviso = {
      tipo: 'CONSULTA_MASIVA',
      destinatario: {
        nombre: destinatario.nombre,
        email: destinatario.email,
        numeroWhatsapp: destinatario.preferencias.numeroWhatsapp,
      },
      consultaId: lote.consultaId,
      procesos: lote.procesos,
      listos: conteo.completados,
      conProblemas: conteo.fallidos,
      porConfirmar: conteo.porConfirmar,
      urlBase: deps.urlBase,
    };
    // Sin canales activos, o sin una vía que pueda reintentarse, se da por avisada.
    let pendiente = false;
    let alguno = canales.length === 0;
    for (const canal of canales) {
      const notificador = deps.notificadores.get(canal);
      const resultado = notificador
        ? await notificador.enviar(aviso, { despachoId })
        : { ok: false as const, error: new ErrorDeEnvio('CANAL_NO_DISPONIBLE') };
      if (resultado.ok) alguno = true;
      else if (resultado.error.transitorio) pendiente = true;
      else alguno = true;
    }
    return alguno || !pendiente;
  }

  return async function despacharNotificaciones(): Promise<ResumenDeDespacho> {
    const totales = { enviadas: 0, reprogramadas: 0, fallidas: 0, lotesAvisados: 0 };
    for (const despachoId of await deps.despachosActivos()) {
      const ahora = deps.reloj.ahora();
      const vencidas = await deps.repositorio.reclamarVencidas(despachoId, {
        ahora,
        limite: AVISOS_POR_TANDA,
        arriendoMs: ARRIENDO_MS,
      });
      const grupos = new Map<string, NotificacionPorEnviar[]>();
      for (const fila of vencidas) {
        const clave = `${fila.membresiaId}|${fila.canal}`;
        grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
      }
      for (const filas of grupos.values()) {
        const canal = filas[0]?.canal;
        if (canal) await enviarGrupo(despachoId, canal, filas, totales);
      }

      const desde = new Date(ahora.getTime() - HORAS_PARA_AVISAR_UN_LOTE * 3_600_000);
      for (const lote of await deps.repositorio.lotesTerminadosSinAviso(despachoId, desde)) {
        if (await avisarLote(despachoId, lote)) {
          await deps.repositorio.marcarLoteAvisado(despachoId, lote.consultaId, deps.reloj.ahora());
          totales.lotesAvisados += 1;
        }
      }
    }
    deps.logger.info('Avisos despachados', totales);
    return totales;
  };
}

function armarAviso(
  urlBase: string,
  filas: readonly NotificacionPorEnviar[],
  procesos: readonly ProcesoAvisado[],
  resumen: boolean,
): AvisoDeActuaciones {
  const { destinatario } = filas[0] as NotificacionPorEnviar;
  return {
    tipo: 'ACTUACIONES',
    destinatario: {
      nombre: destinatario.nombre,
      email: destinatario.email,
      numeroWhatsapp: destinatario.preferencias.numeroWhatsapp,
    },
    modo: resumen ? 'RESUMEN_DIARIO' : 'INMEDIATA',
    procesos,
    urlBase,
  };
}
