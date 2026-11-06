/** Datos estructurados que acompañan un registro. Nunca incluir credenciales ni contenido de documentos. */
export type ContextoLog = Readonly<Record<string, unknown>>;

/**
 * Puerto de registro técnico. Los casos de uso dependen de esta interfaz;
 * la implementación concreta se conecta en `composition-root.ts`.
 */
export interface Logger {
  debug(mensaje: string, contexto?: ContextoLog): void;
  info(mensaje: string, contexto?: ContextoLog): void;
  warn(mensaje: string, contexto?: ContextoLog): void;
  error(mensaje: string, contexto?: ContextoLog): void;
  /** Crea un logger que agrega el contexto dado a cada registro (p. ej. `{ modulo: 'procesos' }`). */
  child(contexto: ContextoLog): Logger;
}
