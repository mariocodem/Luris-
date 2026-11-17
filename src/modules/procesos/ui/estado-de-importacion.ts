/**
 * Estado del asistente de importación (lo devuelve la server action al navegador). Solo lleva
 * texto apto para la persona usuaria (§10).
 */

export interface FilaDeVistaPrevia {
  readonly fila: number;
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly etiquetas: readonly string[];
}

export interface VistaPrevia {
  readonly nombreArchivo: string;
  readonly filasConDatos: number;
  readonly nuevos: readonly FilaDeVistaPrevia[];
  readonly yaRegistrados: readonly FilaDeVistaPrevia[];
  readonly errores: readonly {
    readonly fila: number;
    readonly valor: string;
    readonly mensaje: string;
  }[];
  readonly duplicados: readonly {
    readonly fila: number;
    readonly identificador: string;
    readonly primeraFila: number;
  }[];
}

export type EstadoDeImportacion =
  | { readonly tipo: 'inicial' }
  | { readonly tipo: 'error'; readonly mensaje: string; readonly codigoDeAyuda?: string }
  | {
      readonly tipo: 'vista-previa';
      readonly vista: VistaPrevia;
      /** Error al confirmar (la vista previa se conserva para reintentar). */
      readonly error?: { readonly mensaje: string; readonly codigoDeAyuda?: string };
    }
  | { readonly tipo: 'importado'; readonly creados: number; readonly omitidos: number };

export const IMPORTACION_INICIAL: EstadoDeImportacion = { tipo: 'inicial' };
