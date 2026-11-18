import type { Job } from 'pg-boss';
import type { ServiciosDelWorker } from '@/composition-root';
import type { ResultadoParaConsultaMasiva } from '@/modules/plataformas/application/consulta-masiva';
import type { ResumenDeSincronizacion } from '@/modules/plataformas/domain/sincronizacion';
import {
  REINTENTOS_DE_SINCRONIZACION,
  esquemaCodigoDeAcceso,
  esquemaDocumentos,
  esquemaSolicitud,
  esquemaVerificacion,
} from '@/modules/plataformas/infrastructure/cola-pg-boss';
import { esquemaDeTrabajoDeWhatsapp } from '@/modules/notificaciones/infrastructure/cola-pg-boss';
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
      const { despachoId, procesoId, plataforma } = solicitud.data;
      const esElUltimoIntento = trabajo.retryCount >= REINTENTOS_DE_SINCRONIZACION;
      // Deja el resultado en los ítems de consulta masiva que lo esperaban (nunca rompe el trabajo).
      const avisar = async (resultado: ResultadoParaConsultaMasiva): Promise<void> => {
        try {
          await servicios.registrarResultadoDeConsultaMasiva({
            despachoId,
            procesoId,
            plataforma,
            resultado,
          });
        } catch (error) {
          logger.warn('No se pudo registrar el resultado en la consulta masiva', {
            despachoId,
            procesoId,
            plataforma,
            error,
          });
        }
      };

      let resultado;
      try {
        resultado = await servicios.sincronizarProceso(solicitud.data, { signal: trabajo.signal });
      } catch (error) {
        if (esElUltimoIntento) await avisar({ tipo: 'FALLIDO', codigo: 'RESPUESTA_INESPERADA' });
        throw error;
      }
      if (resultado.ok) {
        await avisar(resultado.value);
        return resultado.value;
      }
      if (resultado.error.transitorio) {
        await avisar(
          esElUltimoIntento
            ? { tipo: 'FALLIDO', codigo: resultado.error.codigo }
            : { tipo: 'REINTENTO', codigo: resultado.error.codigo },
        );
        throw new FalloPasajero(
          `${resultado.error.codigo}: ${resultado.error.detalleTecnico ?? ''}`,
        );
      }
      logger.warn('Sincronización sin éxito', {
        ...solicitud.data,
        codigo: resultado.error.codigo,
        detalle: resultado.error.detalleTecnico,
      });
      const fallido: ResumenDeSincronizacion = { tipo: 'FALLIDO', codigo: resultado.error.codigo };
      await avisar(fallido);
      return fallido;
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

    async codigoDeAcceso(trabajo: Job<unknown>) {
      const datos = esquemaCodigoDeAcceso.safeParse(trabajo.data);
      if (!datos.success) {
        logger.error('Trabajo de código de acceso con datos inválidos', { idTrabajo: trabajo.id });
        return;
      }
      const { despachoId, credencialId, codigo, version } = datos.data;
      const resultado = await servicios.completarIngreso(
        {
          despachoId,
          credencialId,
          codigo: { datos: new Uint8Array(Buffer.from(codigo, 'base64')), version },
        },
        { signal: trabajo.signal },
      );
      // Nunca se registra el código: solo cómo terminó.
      logger.info('Código de acceso procesado', {
        despachoId,
        credencialId,
        resultado: resultado.ok ? resultado.value : resultado.error.codigo,
      });
      return { resultado: resultado.ok ? resultado.value : resultado.error.codigo };
    },

    async programada() {
      return servicios.programarSincronizacion();
    },

    /** Envía los avisos que vencen y avisa de las consultas masivas terminadas (§9, §7). */
    async despacharNotificaciones() {
      return servicios.despacharNotificaciones();
    },

    async vincularWhatsapp(trabajo: Job<unknown>) {
      const datos = esquemaDeTrabajoDeWhatsapp.safeParse(trabajo.data);
      if (!datos.success || !servicios.gestorDeWhatsapp) {
        logger.warn('No se puede vincular WhatsApp: datos inválidos o sin clave de cifrado');
        return;
      }
      await servicios.gestorDeWhatsapp.vincular(datos.data.despachoId);
    },

    async desvincularWhatsapp(trabajo: Job<unknown>) {
      const datos = esquemaDeTrabajoDeWhatsapp.safeParse(trabajo.data);
      if (!datos.success || !servicios.gestorDeWhatsapp) return;
      await servicios.gestorDeWhatsapp.desvincular(datos.data.despachoId);
    },
  };
}
