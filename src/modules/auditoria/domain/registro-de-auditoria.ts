/** Acciones de cuenta y de plataforma que quedan en la auditoría (§4, Fase 2). */
export const ACCIONES_DE_AUDITORIA = [
  'SESION_INICIADA',
  'SESION_FALLIDA',
  'SESION_CERRADA',
  'RECUPERACION_SOLICITADA',
  'CONTRASENA_RESTABLECIDA',
  'INVITACION_ENVIADA',
  'INVITACION_CANCELADA',
  'INVITACION_ACEPTADA',
  'ROL_CAMBIADO',
  'CUENTA_DESACTIVADA',
  'CUENTA_REACTIVADA',
  'DESPACHO_CREADO',
  'DESPACHO_SUSPENDIDO',
  'DESPACHO_REACTIVADO',
] as const;

export type AccionDeAuditoria = (typeof ACCIONES_DE_AUDITORIA)[number];

/** Dato que se puede guardar en la auditoría. Nunca contraseñas, tokens ni enlaces. */
export type DatoDeAuditoria = string | number | boolean | null;

export interface EventoDeAuditoria {
  /** Despacho afectado; nulo para acciones sin despacho (p. ej. un inicio de sesión fallido). */
  readonly despachoId: string | null;
  /** Quién hizo la acción; nulo si no hay sesión (inicio de sesión fallido, recuperación). */
  readonly actorId: string | null;
  readonly accion: AccionDeAuditoria;
  readonly entidad?: string;
  readonly entidadId?: string;
  readonly datos?: Readonly<Record<string, DatoDeAuditoria>>;
  readonly ip?: string | null;
}

/**
 * Puerto de auditoría. Registrar nunca debe hacer fallar la acción del usuario: la
 * implementación captura sus propios errores y los deja en el log técnico.
 */
export interface RegistradorDeAuditoria {
  registrar(evento: EventoDeAuditoria): Promise<void>;
}
