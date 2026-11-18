import type { Logger } from '@/shared/domain/logger';
import type { CanalDeAviso } from '../domain/aviso';
import { proximaHoraDeResumen } from '../domain/programacion';
import type { NotificacionAProgramar, Reloj, RepositorioDeNotificaciones } from './puertos';

export interface SolicitudDeNotificaciones {
  readonly despachoId: string;
  readonly procesoId: string;
  /** Actuaciones nuevas (nunca las de la carga inicial, que son historia). */
  readonly actuacionIds: readonly string[];
}

/**
 * Programa los avisos de las actuaciones nuevas de un proceso (§9): una fila por actuación,
 * persona y canal activo. Los de «de inmediato» salen ya; los de resumen diario, a la hora del
 * resumen. Es idempotente: repetirla no duplica avisos.
 */
export function crearProgramarNotificaciones(deps: {
  readonly repositorio: RepositorioDeNotificaciones;
  readonly reloj: Reloj;
  /** Hora (0-23, Bogotá) a la que sale el resumen diario. */
  readonly horaDelResumen: number;
  readonly logger: Logger;
}) {
  return async function programarNotificaciones(
    solicitud: SolicitudDeNotificaciones,
  ): Promise<number> {
    if (solicitud.actuacionIds.length === 0) return 0;
    const ahora = deps.reloj.ahora();
    const destinatarios = await deps.repositorio.destinatariosDeProceso(
      solicitud.despachoId,
      solicitud.procesoId,
    );

    const filas: NotificacionAProgramar[] = [];
    for (const { membresiaId, preferencias } of destinatarios) {
      const canales: CanalDeAviso[] = [];
      if (preferencias.correoActivo) canales.push('CORREO');
      if (
        preferencias.whatsappActivo &&
        preferencias.numeroWhatsapp &&
        preferencias.consentimientoWhatsappEn
      ) {
        canales.push('WHATSAPP');
      }
      const programadaPara =
        preferencias.frecuencia === 'INMEDIATA'
          ? ahora
          : proximaHoraDeResumen(ahora, deps.horaDelResumen);
      for (const canal of canales) {
        for (const actuacionId of solicitud.actuacionIds) {
          filas.push({ actuacionId, membresiaId, canal, programadaPara });
        }
      }
    }
    if (filas.length === 0) return 0;
    const creadas = await deps.repositorio.programar(solicitud.despachoId, filas);
    deps.logger.info('Avisos programados', {
      despachoId: solicitud.despachoId,
      procesoId: solicitud.procesoId,
      actuaciones: solicitud.actuacionIds.length,
      avisos: creadas,
    });
    return creadas;
  };
}
