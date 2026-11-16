import type { EstadoInvitacion, Invitacion } from '../domain/invitacion';
import type { RolDeDespacho } from '../domain/rol-de-despacho';
import type { Result } from '@/shared/domain/result';

/**
 * Puertos que necesitan los casos de uso de cuentas. Las implementaciones (Better Auth, Prisma,
 * memoria) se conectan en composition-root.ts.
 */

// ─── Autenticación ────────────────────────────────────────────────────────────

export interface SesionAutenticada {
  readonly sesionId: string;
  readonly usuarioId: string;
  readonly despachoActivoId: string | null;
}

export interface SesionIniciada {
  readonly usuarioId: string;
  /** Token opaco de la sesión recién creada (para revocarla o cambiar su despacho activo). */
  readonly tokenDeSesion: string;
}

/** Fachada sobre el proveedor de autenticación (Better Auth). Trabaja con la petición en curso. */
export interface ServicioDeAutenticacion {
  /** Verifica la contraseña y, si coincide, crea la sesión y su cookie. */
  iniciarSesion(
    email: string,
    contrasena: string,
  ): Promise<Result<SesionIniciada, 'CREDENCIALES_INVALIDAS'>>;
  cerrarSesion(): Promise<void>;
  sesionActual(): Promise<SesionAutenticada | null>;
  revocarSesion(tokenDeSesion: string): Promise<void>;
  establecerDespachoActivo(tokenDeSesion: string, despachoId: string): Promise<void>;
  /** Envía el correo de recuperación si la cuenta existe; no revela si existe o no. */
  solicitarRecuperacion(email: string): Promise<void>;
  restablecerContrasena(token: string, contrasena: string): Promise<Result<void, 'TOKEN_INVALIDO'>>;
  /** Crea la persona con su contraseña (aceptación de una invitación). */
  crearUsuarioConContrasena(datos: {
    readonly nombre: string;
    readonly email: string;
    readonly contrasena: string;
  }): Promise<{ readonly usuarioId: string }>;
}

/** Frena los intentos repetidos de inicio de sesión (por correo y por dirección IP). */
export interface LimitadorDeIntentos {
  /** Minutos que faltan para poder reintentar, o 0 si no está bloqueado. */
  minutosDeBloqueo(clave: string): number;
  registrarFallo(clave: string): void;
  limpiar(clave: string): void;
}

// ─── Datos ────────────────────────────────────────────────────────────────────

export interface UsuarioResumen {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly esSuperadmin: boolean;
}

export interface DespachoResumen {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'ACTIVO' | 'SUSPENDIDO';
}

export interface MiembroDelDespacho {
  readonly membresiaId: string;
  readonly usuarioId: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: RolDeDespacho;
  readonly activa: boolean;
  readonly desde: Date;
}

export type AccesoADespacho =
  | { readonly despachoId: string }
  | { readonly despachoId: null; readonly motivo: 'SUSPENDIDO' | 'SIN_MEMBRESIA' };

export interface RepositorioDeUsuarios {
  buscarPorId(usuarioId: string): Promise<UsuarioResumen | null>;
  buscarPorEmail(email: string): Promise<UsuarioResumen | null>;
}

export interface RepositorioDeMembresias {
  /** Membresía del usuario en el despacho, con el estado del despacho. */
  buscarDelUsuario(
    usuarioId: string,
    despachoId: string,
  ): Promise<{ readonly miembro: MiembroDelDespacho; readonly despacho: DespachoResumen } | null>;
  /**
   * Primer despacho activo donde el usuario tiene una membresía activa; si no hay, el motivo
   * (sus despachos están suspendidos, o no tiene membresías activas).
   */
  primerDespachoDisponible(usuarioId: string): Promise<AccesoADespacho>;
  listar(despachoId: string): Promise<readonly MiembroDelDespacho[]>;
  buscar(despachoId: string, membresiaId: string): Promise<MiembroDelDespacho | null>;
  contarAdministradoresActivos(despachoId: string): Promise<number>;
  cambiarRol(despachoId: string, membresiaId: string, rol: RolDeDespacho): Promise<void>;
  cambiarActiva(despachoId: string, membresiaId: string, activa: boolean): Promise<void>;
  esMiembro(despachoId: string, usuarioId: string): Promise<boolean>;
}

export interface NuevaInvitacion {
  readonly despachoId: string;
  readonly email: string;
  readonly rol: RolDeDespacho;
  readonly expiraEn: Date;
  readonly invitadoPorId: string;
  readonly tokenHash: string;
}

export interface InvitacionConDespacho extends Invitacion {
  readonly despachoNombre: string;
  readonly despachoEstado: 'ACTIVO' | 'SUSPENDIDO';
}

export interface RepositorioDeInvitaciones {
  /** Crea la invitación y cancela cualquier otra pendiente para el mismo correo y despacho. */
  crear(invitacion: NuevaInvitacion): Promise<Invitacion>;
  /** Búsqueda global por el hash del token del enlace (la persona aún no tiene sesión). */
  buscarPorTokenHash(tokenHash: string): Promise<InvitacionConDespacho | null>;
  listar(despachoId: string, estado: EstadoInvitacion): Promise<readonly Invitacion[]>;
  cancelar(despachoId: string, invitacionId: string): Promise<boolean>;
  /**
   * De forma atómica: marca la invitación como aceptada (solo si sigue pendiente y vigente) y
   * crea la membresía. Devuelve false si la invitación ya no era válida (un solo uso).
   */
  aceptar(datos: {
    readonly invitacionId: string;
    readonly usuarioId: string;
    readonly ahora: Date;
  }): Promise<
    { readonly aceptada: true; readonly membresiaId: string } | { readonly aceptada: false }
  >;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export interface Reloj {
  ahora(): Date;
}

/** Genera tokens aleatorios para enlaces de un solo uso y calcula su hash. */
export interface GeneradorDeTokens {
  generar(): string;
  hash(token: string): string;
}
