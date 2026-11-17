import type { Logger } from '@/shared/domain/logger';
import type { CodigoPlataforma } from '../domain/plataforma';
import type {
  ColaDeTrabajos,
  Reloj,
  RepositorioDePendientes,
  RepositorioDeSincronizacion,
  SolicitudDeSincronizacion,
} from './puertos';
import { identificadorPara, type PlataformaAutomatica } from './solicitar-consulta';

/** Plataforma con consulta asistida (reto que resuelve la persona, §6). */
export interface PlataformaAsistida {
  readonly codigo: CodigoPlataforma;
  readonly identificador: 'RADICADO' | 'NUNC';
}

/**
 * Sincronización programada (Fases 5 y 6), despacho por despacho y con el acceso aislado de
 * cada uno:
 * - Plataformas automáticas: encola, con prioridad normal, la consulta de cada proceso activo que
 *   tenga su identificador. El ritmo real lo pone la cola (límite por plataforma).
 * - Plataformas asistidas: abre un pendiente en la bandeja «Pendientes de tu confirmación» para
 *   cada proceso que lleve `diasEntreConfirmaciones` días sin consultarse ahí.
 */
export function crearProgramarSincronizacion(deps: {
  readonly repositorio: RepositorioDeSincronizacion;
  readonly cola: ColaDeTrabajos;
  readonly automaticas: readonly PlataformaAutomatica[];
  readonly asistidas: readonly PlataformaAsistida[];
  readonly pendientes: RepositorioDePendientes;
  readonly diasEntreConfirmaciones: number;
  readonly reloj: Reloj;
  readonly logger: Logger;
}) {
  return async function programarSincronizacion(): Promise<{
    readonly encolados: number;
    readonly pendientesAbiertos: number;
  }> {
    let encolados = 0;
    let pendientesAbiertos = 0;
    const antesDe = new Date(
      deps.reloj.ahora().getTime() - deps.diasEntreConfirmaciones * 24 * 60 * 60 * 1000,
    );

    for (const despachoId of await deps.repositorio.despachosActivos()) {
      const procesos = await deps.repositorio.procesosActivos(despachoId);
      const solicitudes: SolicitudDeSincronizacion[] = [];
      for (const proceso of procesos) {
        for (const plataforma of deps.automaticas) {
          if (identificadorPara(plataforma, proceso)) {
            solicitudes.push({ despachoId, procesoId: proceso.id, plataforma: plataforma.codigo });
          }
        }
      }
      if (solicitudes.length > 0) encolados += await deps.cola.encolarSincronizaciones(solicitudes);

      for (const { codigo, identificador } of deps.asistidas) {
        pendientesAbiertos += await deps.pendientes.abrirVencidos(
          despachoId,
          codigo,
          identificador,
          antesDe,
        );
      }
    }
    deps.logger.info('Sincronización programada', { encolados, pendientesAbiertos });
    return { encolados, pendientesAbiertos };
  };
}
