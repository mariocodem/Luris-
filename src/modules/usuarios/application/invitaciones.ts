import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { EnviadorDeCorreos } from '@/modules/notificaciones/domain/enviador-de-correos';
import { type AppError, AppError as ErrorBase, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorEnlaceInvalido, ErrorReglaDeCuenta } from '../domain/errores';
import { calcularVencimiento, estaVigente, type Invitacion } from '../domain/invitacion';
import type { RolDeDespacho } from '../domain/rol-de-despacho';
import { exigirMiembroConPermiso, type ContextoDeSesion } from './contexto-de-sesion';
import { correoDeInvitacion } from './correos';
import type {
  GeneradorDeTokens,
  RepositorioDeInvitaciones,
  RepositorioDeMembresias,
  RepositorioDeUsuarios,
  Reloj,
  ServicioDeAutenticacion,
} from './puertos';

export interface DependenciasDeInvitaciones {
  readonly invitaciones: RepositorioDeInvitaciones;
  readonly membresias: RepositorioDeMembresias;
  readonly usuarios: RepositorioDeUsuarios;
  readonly autenticacion: ServicioDeAutenticacion;
  readonly correos: EnviadorDeCorreos;
  readonly tokens: GeneradorDeTokens;
  readonly reloj: Reloj;
  readonly auditoria: RegistradorDeAuditoria;
  readonly urlBase: string;
  readonly horasDeVigencia: number;
}

export class ErrorCorreoNoEnviado extends ErrorBase {
  constructor(causa: unknown) {
    super({
      codigo: 'CORREO_NO_ENVIADO',
      mensajeUsuario:
        'Guardamos la invitación, pero no pudimos enviar el correo. Intenta reenviarla en unos minutos.',
      causa,
    });
  }
}

/**
 * Crea una invitación y envía el correo con el enlace de un solo uso. Lo usan el administrador
 * (invitar a su despacho) y el superadmin (primer administrador de un despacho nuevo).
 */
export async function emitirInvitacion(
  deps: DependenciasDeInvitaciones,
  datos: {
    readonly despachoId: string;
    readonly despachoNombre: string;
    readonly email: string;
    readonly rol: RolDeDespacho;
    readonly invitadoPor: { readonly id: string; readonly nombre: string };
    readonly ip: string | null;
  },
): Promise<Result<Invitacion, AppError>> {
  const existente = await deps.usuarios.buscarPorEmail(datos.email);
  if (existente && (await deps.membresias.esMiembro(datos.despachoId, existente.id))) {
    return err(
      new ErrorReglaDeCuenta(
        'YA_ES_MIEMBRO',
        'Esta persona ya tiene una cuenta en el despacho. Si está desactivada, reactívala desde la lista de usuarios.',
      ),
    );
  }
  if (existente?.esSuperadmin) {
    return err(
      new ErrorReglaDeCuenta(
        'CORREO_DE_OPERADOR',
        'Ese correo pertenece a un operador de LURIS y no puede unirse a un despacho. Usa otro correo.',
      ),
    );
  }

  const token = deps.tokens.generar();
  const invitacion = await deps.invitaciones.crear({
    despachoId: datos.despachoId,
    email: datos.email,
    rol: datos.rol,
    expiraEn: calcularVencimiento(deps.reloj.ahora(), deps.horasDeVigencia),
    invitadoPorId: datos.invitadoPor.id,
    tokenHash: deps.tokens.hash(token),
  });
  await deps.auditoria.registrar({
    despachoId: datos.despachoId,
    actorId: datos.invitadoPor.id,
    accion: 'INVITACION_ENVIADA',
    entidad: 'Invitacion',
    entidadId: invitacion.id,
    datos: { email: datos.email, rol: datos.rol },
    ip: datos.ip,
  });

  const envio = await deps.correos.enviar(
    correoDeInvitacion({
      para: datos.email,
      despacho: datos.despachoNombre,
      invitadoPor: datos.invitadoPor.nombre,
      rol: datos.rol,
      url: `${deps.urlBase}/invitacion/${token}`,
      expiraEn: invitacion.expiraEn,
    }),
  );
  if (!envio.ok) return err(new ErrorCorreoNoEnviado(envio.error));
  return ok(invitacion);
}

/** El administrador invita a una persona a su despacho con un rol. */
export function crearInvitarUsuario(deps: DependenciasDeInvitaciones) {
  return async function invitarUsuario(
    contexto: ContextoDeSesion,
    datos: { readonly email: string; readonly rol: RolDeDespacho; readonly ip: string | null },
  ): Promise<Result<Invitacion, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CUENTAS_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    return emitirInvitacion(deps, {
      despachoId: actor.despacho.id,
      despachoNombre: actor.despacho.nombre,
      email: datos.email,
      rol: datos.rol,
      invitadoPor: { id: actor.usuarioId, nombre: actor.nombre },
      ip: datos.ip,
    });
  };
}

export function crearCancelarInvitacion(
  deps: Pick<DependenciasDeInvitaciones, 'invitaciones' | 'auditoria'>,
) {
  return async function cancelarInvitacion(
    contexto: ContextoDeSesion,
    datos: { readonly invitacionId: string; readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CUENTAS_GESTIONAR');
    if (!permiso.ok) return permiso;
    const despachoId = permiso.value.despacho.id;

    const cancelada = await deps.invitaciones.cancelar(despachoId, datos.invitacionId);
    if (!cancelada) {
      return err(new ErrorNoEncontrado('Esta invitación ya no está pendiente.'));
    }
    await deps.auditoria.registrar({
      despachoId,
      actorId: contexto.usuarioId,
      accion: 'INVITACION_CANCELADA',
      entidad: 'Invitacion',
      entidadId: datos.invitacionId,
      ip: datos.ip,
    });
    return ok(undefined);
  };
}

export interface InvitacionParaAceptar {
  readonly email: string;
  readonly rol: RolDeDespacho;
  readonly despachoNombre: string;
  /** Si el correo ya tiene cuenta en LURIS: entonces se pide su contraseña actual. */
  readonly yaTieneCuenta: boolean;
}

async function buscarInvitacionVigente(
  deps: Pick<DependenciasDeInvitaciones, 'invitaciones' | 'tokens' | 'reloj'>,
  token: string,
) {
  const invitacion = await deps.invitaciones.buscarPorTokenHash(deps.tokens.hash(token));
  if (!invitacion || !estaVigente(invitacion, deps.reloj.ahora())) return null;
  if (invitacion.despachoEstado !== 'ACTIVO') return null;
  return invitacion;
}

/** Datos que muestra la página del enlace de invitación (sin sesión). */
export function crearConsultarInvitacion(
  deps: Pick<DependenciasDeInvitaciones, 'invitaciones' | 'tokens' | 'reloj' | 'usuarios'>,
) {
  return async function consultarInvitacion(
    token: string,
  ): Promise<Result<InvitacionParaAceptar, ErrorEnlaceInvalido>> {
    const invitacion = await buscarInvitacionVigente(deps, token);
    if (!invitacion) return err(new ErrorEnlaceInvalido('invitacion'));
    const usuario = await deps.usuarios.buscarPorEmail(invitacion.email);
    return ok({
      email: invitacion.email,
      rol: invitacion.rol,
      despachoNombre: invitacion.despachoNombre,
      yaTieneCuenta: usuario !== null,
    });
  };
}

/**
 * Acepta la invitación desde el enlace:
 * - Si la persona es nueva, crea su usuario con la contraseña que eligió.
 * - Si ya tiene cuenta (en otro despacho), verifica su contraseña actual.
 * Luego crea la membresía (una sola vez, de forma atómica) e inicia la sesión en ese despacho.
 */
export function crearAceptarInvitacion(deps: DependenciasDeInvitaciones) {
  return async function aceptarInvitacion(datos: {
    readonly token: string;
    readonly nombre: string | null;
    readonly contrasena: string;
    readonly ip: string | null;
  }): Promise<Result<void, AppError>> {
    const invitacion = await buscarInvitacionVigente(deps, datos.token);
    if (!invitacion) return err(new ErrorEnlaceInvalido('invitacion'));

    const existente = await deps.usuarios.buscarPorEmail(invitacion.email);
    let usuarioId: string;
    let tokenDeSesion: string | null = null;
    if (existente) {
      const sesion = await deps.autenticacion.iniciarSesion(invitacion.email, datos.contrasena);
      if (!sesion.ok) {
        return err(
          new ErrorReglaDeCuenta(
            'CONTRASENA_INCORRECTA',
            'Esa no es la contraseña de tu cuenta de LURIS. Revísala o recupérala desde la página de inicio de sesión.',
          ),
        );
      }
      usuarioId = existente.id;
      tokenDeSesion = sesion.value.tokenDeSesion;
    } else {
      if (!datos.nombre) {
        return err(new ErrorReglaDeCuenta('NOMBRE_REQUERIDO', 'Escribe tu nombre completo.'));
      }
      const creado = await deps.autenticacion.crearUsuarioConContrasena({
        nombre: datos.nombre,
        email: invitacion.email,
        contrasena: datos.contrasena,
      });
      usuarioId = creado.usuarioId;
    }

    const resultado = await deps.invitaciones.aceptar({
      invitacionId: invitacion.id,
      usuarioId,
      ahora: deps.reloj.ahora(),
    });
    if (!resultado.aceptada) {
      if (tokenDeSesion) await deps.autenticacion.revocarSesion(tokenDeSesion);
      return err(new ErrorEnlaceInvalido('invitacion', 'La invitación se usó en paralelo'));
    }

    if (!tokenDeSesion) {
      const sesion = await deps.autenticacion.iniciarSesion(invitacion.email, datos.contrasena);
      if (!sesion.ok)
        return err(new ErrorEnlaceInvalido('invitacion', 'No se pudo iniciar sesión'));
      tokenDeSesion = sesion.value.tokenDeSesion;
    }
    await deps.autenticacion.establecerDespachoActivo(tokenDeSesion, invitacion.despachoId);

    await deps.auditoria.registrar({
      despachoId: invitacion.despachoId,
      actorId: usuarioId,
      accion: 'INVITACION_ACEPTADA',
      entidad: 'Membresia',
      entidadId: resultado.membresiaId,
      datos: { rol: invitacion.rol },
      ip: datos.ip,
    });
    return ok(undefined);
  };
}
