import type { VistaPreviaDeConsultaMasiva } from '../application/consulta-masiva';

/**
 * Estado del asistente de consulta masiva (lo devuelve la server action al navegador). Solo lleva
 * texto apto para la persona usuaria (§10).
 */
export type EstadoDeConsultaMasiva =
  | { readonly tipo: 'inicial' }
  | { readonly tipo: 'error'; readonly mensaje: string; readonly codigoDeAyuda?: string }
  | {
      readonly tipo: 'vista-previa';
      readonly vista: VistaPreviaDeConsultaMasiva;
      /** De dónde salió (texto pegado o nombre del archivo), para recordarlo en el resumen. */
      readonly origen: string;
      /** Error al ejecutar (el resumen se conserva para reintentar). */
      readonly error?: { readonly mensaje: string; readonly codigoDeAyuda?: string };
    };

export const CONSULTA_MASIVA_INICIAL: EstadoDeConsultaMasiva = { tipo: 'inicial' };
