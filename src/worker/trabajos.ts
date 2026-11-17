import type { Job } from 'pg-boss';
import type { ServiciosDelWorker } from '@/composition-root';
import type { ResumenDeSincronizacion } from '@/modules/plataformas/domain/sincronizacion';
import {
  esquemaDocumentos,
  esquemaSolicitud,
  esquemaVerificacion,
} from '@/modules/plataformas/infrastructure/cola-pg-boss';
import type { Logger } from '@/shared/domain/logger';

/**
 * Traducen un trabajo de la cola a un caso de uso. Reglas de reintento:
 * - Fallo pasajero de la plataforma (no respondió, pidió esperar) o fallo inesperado: se lanza,
 *   y pg-boss reintenta con espera exponencial.
 * - Fallo permanente (no encontrado, formato inesperado…): el trabajo termina con ese resultado;
 *   reintentar no lo arreglaría.
 */
export class FalloPasajero extends Error {
  override readonly name = 'FalloPasajero';
}

export function crearManejadores(servicios: ServiciosDelWorker, logger: Logger) {
  return {
    async sincronizar(trabajo: Job<unknown>): Promise<ResumenDeSincronizacion> {
      const solicitud = esquemaSolicitud.safeParse(trabajo.data);
      if (!solicitud.success) {
        logger.error('Trabajo de sincronización con datos inválidos', { idTrabajo: trabajo.id });
        return { tipo: 'OMITIDO', motivo: 'PROCESO_NO_ENCONTRADO' };
      }
      const resultado = await servicios.sincronizarProceso(solicitud.data, {
        signal: trabajo.signal,
      });
      if (resultado.ok) return resultado.value;
      if (resultado.error.transitorio) {
        throw new FalloPasajero(
          `${resultado.error.codigo}: ${resultado.error.detalleTecnico ?? ''}`,
        );
      }
      logger.warn('Sincronización sin éxito', {
        ...solicitud.data,
        codigo: resultado.error.codigo,
        detalle: resultado.error.detalleTecnico,
      });
      return { tipo: 'FALLIDO', codigo: resultado.error.codigo };
    },

    async documentos(trabajo: Job<unknown>) {
      const datos = esquemaDocumentos.safeParse(trabajo.data);
      if (!datos.success) {
        logger.error('Trabajo de documentos con datos inválidos', { idTrabajo: trabajo.id });
        return { descargados: 0, noDisponibles: 0 };
      }
      const resultado = await servicios.obtenerDocumentos(datos.data, { signal: trabajo.signal });
      if (resultado.ok) return resultado.value;
      if (resultado.error.transitorio) {
        throw new FalloPasajero(
          `${resultado.error.codigo}: ${resultado.error.detalleTecnico ?? ''}`,
        );
      }
      logger.warn('Documentos sin obtener', { ...datos.data, codigo: resultado.error.codigo });
      return { descargados: 0, noDisponibles: 0, codigo: resultado.error.codigo };
    },

    async verificarCredencial(trabajo: Job<unknown>) {
      const datos = esquemaVerificacion.safeParse(trabajo.data);
      if (!datos.success) {
        logger.error('Trabajo de verificación con datos inválidos', { idTrabajo: trabajo.id });
        return;
      }
      const resultado = await servicios.verificarCredencial(datos.data, { signal: trabajo.signal });
      // Nunca se registra el usuario ni el secreto: solo el resultado.
      if (!resultado.ok) throw new FalloPasajero(resultado.error.codigo);
    },

    async programada() {
      return servicios.programarSincronizacion();
    },
  };
}
