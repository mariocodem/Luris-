/**
 * Respuesta de una server action a un formulario. Solo lleva texto apto para la persona usuaria:
 * nunca códigos HTTP, trazas ni nombres de excepciones (§10).
 */
export type EstadoDeFormulario =
  | { readonly tipo: 'inicial' }
  | {
      readonly tipo: 'error';
      readonly mensaje: string;
      readonly codigoDeAyuda?: string;
      readonly errores?: Readonly<Record<string, readonly string[]>>;
      /** Valores para volver a llenar el formulario (nunca contraseñas). */
      readonly valores?: Readonly<Record<string, string>>;
    }
  | { readonly tipo: 'exito'; readonly mensaje: string };

export const ESTADO_INICIAL: EstadoDeFormulario = { tipo: 'inicial' };

export function erroresDe(estado: EstadoDeFormulario, campo: string): readonly string[] {
  return estado.tipo === 'error' ? (estado.errores?.[campo] ?? []) : [];
}

export function valorDe(estado: EstadoDeFormulario, campo: string): string | undefined {
  return estado.tipo === 'error' ? estado.valores?.[campo] : undefined;
}
