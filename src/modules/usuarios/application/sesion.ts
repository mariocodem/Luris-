import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { AppError } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  ErrorCredencialesInvalidas,
  ErrorCuentaSinAcceso,
  ErrorDemasiadosIntentos,
  ErrorDespachoSuspendido,
  ErrorEnlaceInvalido,
} from '../domain/errores';
import type {
  LimitadorDeIntentos,
  RepositorioDeMembresias,
  RepositorioDeUsuarios,
  ServicioDeAutenticacion,
} from './puertos';

export interface DependenciasDeSesion {
  readonly autenticacion: ServicioDeAutenticacion;
  readonly usuarios: RepositorioDeUsuarios;
  readonly membresias: RepositorioDeMembresias;
  readonly limitador: LimitadorDeIntentos;
  readonly auditoria: RegistradorDeAuditoria;
}

export interface DatosDeInicioDeSesion {
  /** Ya validado y en minúsculas. */
  readonly email: string;
  readonly contrasena: string;
  readonly ip: string | null;
}

export type DestinoTrasIniciarSesion = '/plataforma/despachos' | '/inicio';

/**
 * Inicia sesión con correo y contraseña. Frena los intentos repetidos por correo y por IP, y
 * no deja entrar a quien no tenga un despacho activo (salvo el superadmin).
 */
export function crearIniciarSesion(deps: DependenciasDeSesion) {
  return async function iniciarSesion(
    datos: DatosDeInicioDeSesion,
  ): Promise<Result<{ readonly destino: DestinoTrasIniciarSesion }, AppError>> {
    const claves = [`email:${datos.email}`, ...(datos.ip ? [`ip:${datos.ip}`] : [])];
    const bloqueo = Math.max(...claves.map((clave) => deps.limitador.minutosDeBloqueo(clave)));
    if (bloqueo > 0) return err(new ErrorDemasiadosIntentos(bloqueo));

    const resultado = await deps.autenticacion.iniciarSesion(datos.email, datos.contrasena);
    if (!resultado.ok) {
      claves.forEach((clave) => deps.limitador.registrarFallo(clave));
      await deps.auditoria.registrar({
        despachoId: null,
        actorId: null,
        accion: 'SESION_FALLIDA',
        datos: { email: datos.email },
        ip: datos.ip,
      });
      return err(new ErrorCredencialesInvalidas());
    }
    claves.forEach((clave) => deps.limitador.limpiar(clave));

    const { usuarioId, tokenDeSesion } = resultado.value;
    const usuario = await deps.usuarios.buscarPorId(usuarioId);
    if (usuario?.esSuperadmin) {
      await deps.auditoria.registrar({
        despachoId: null,
        actorId: usuarioId,
        accion: 'SESION_INICIADA',
        ip: datos.ip,
      });
      return ok({ destino: '/plataforma/despachos' });
    }

    const acceso = await verificarAcceso(deps, usuarioId);
    if (!acceso.ok) {
      await deps.autenticacion.revocarSesion(tokenDeSesion);
      return acceso;
    }
    await deps.autenticacion.establecerDespachoActivo(tokenDeSesion, acceso.value);
    await deps.auditoria.registrar({
      despachoId: acceso.value,
      actorId: usuarioId,
      accion: 'SESION_INICIADA',
      ip: datos.ip,
    });
    return ok({ destino: '/inicio' });
  };
}

async function verificarAcceso(
  deps: DependenciasDeSesion,
  usuarioId: string,
): Promise<Result<string, ErrorCuentaSinAcceso | ErrorDespachoSuspendido>> {
  const acceso = await deps.membresias.primerDespachoDisponible(usuarioId);
  if (acceso.despachoId !== null) return ok(acceso.despachoId);
  if (acceso.motivo === 'SUSPENDIDO') return err(new ErrorDespachoSuspendido());
  return err(new ErrorCuentaSinAcceso(`Usuario ${usuarioId} sin despacho disponible`));
}

export function crearCerrarSesion(deps: Pick<DependenciasDeSesion, 'autenticacion' | 'auditoria'>) {
  return async function cerrarSesion(ip: string | null): Promise<void> {
    const sesion = await deps.autenticacion.sesionActual();
    await deps.autenticacion.cerrarSesion();
    if (sesion) {
      await deps.auditoria.registrar({
        despachoId: sesion.despachoActivoId,
        actorId: sesion.usuarioId,
        accion: 'SESION_CERRADA',
        ip,
      });
    }
  };
}

/**
 * Pide el correo de recuperación. Siempre responde igual, exista o no la cuenta, para no
 * revelar qué correos están registrados.
 */
export function crearSolicitarRecuperacion(
  deps: Pick<DependenciasDeSesion, 'autenticacion' | 'auditoria' | 'limitador'>,
) {
  return async function solicitarRecuperacion(datos: {
    readonly email: string;
    readonly ip: string | null;
  }): Promise<Result<void, ErrorDemasiadosIntentos>> {
    const clave = `recuperacion:${datos.email}`;
    const bloqueo = deps.limitador.minutosDeBloqueo(clave);
    if (bloqueo > 0) return err(new ErrorDemasiadosIntentos(bloqueo));
    deps.limitador.registrarFallo(clave);

    await deps.autenticacion.solicitarRecuperacion(datos.email);
    await deps.auditoria.registrar({
      despachoId: null,
      actorId: null,
      accion: 'RECUPERACION_SOLICITADA',
      datos: { email: datos.email },
      ip: datos.ip,
    });
    return ok(undefined);
  };
}

export function crearRestablecerContrasena(
  deps: Pick<DependenciasDeSesion, 'autenticacion' | 'auditoria'>,
) {
  return async function restablecerContrasena(datos: {
    readonly token: string;
    readonly contrasena: string;
    readonly ip: string | null;
  }): Promise<Result<void, ErrorEnlaceInvalido>> {
    const resultado = await deps.autenticacion.restablecerContrasena(datos.token, datos.contrasena);
    if (!resultado.ok) return err(new ErrorEnlaceInvalido('recuperacion'));
    await deps.auditoria.registrar({
      despachoId: null,
      actorId: null,
      accion: 'CONTRASENA_RESTABLECIDA',
      ip: datos.ip,
    });
    return ok(undefined);
  };
}
