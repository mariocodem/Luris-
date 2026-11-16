import { ErrorSinPermiso } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  ErrorCuentaSinAcceso,
  ErrorDespachoSuspendido,
  ErrorNoAutenticado,
} from '../domain/errores';
import { autorizar, type Accion, type Perfil, type RelacionConRecurso } from '../domain/permisos';
import type { RolDeDespacho } from '../domain/rol-de-despacho';
import type {
  RepositorioDeMembresias,
  RepositorioDeUsuarios,
  ServicioDeAutenticacion,
} from './puertos';

/** Quién está usando LURIS en esta petición, ya verificado en el servidor. */
export type ContextoDeSesion = ContextoSuperadmin | ContextoMiembro;

interface ContextoBase {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly email: string;
}

export interface ContextoSuperadmin extends ContextoBase {
  readonly perfil: 'superadmin';
  readonly despacho: null;
  readonly membresiaId: null;
}

export interface ContextoMiembro extends ContextoBase {
  readonly perfil: RolDeDespacho;
  readonly despacho: { readonly id: string; readonly nombre: string };
  readonly membresiaId: string;
}

export type ErrorDeSesion = ErrorNoAutenticado | ErrorCuentaSinAcceso | ErrorDespachoSuspendido;

export interface DependenciasDeContexto {
  readonly autenticacion: ServicioDeAutenticacion;
  readonly usuarios: RepositorioDeUsuarios;
  readonly membresias: RepositorioDeMembresias;
}

/**
 * Resuelve la sesión de la petición: el usuario existe, su membresía sigue activa y su despacho
 * no está suspendido. Se evalúa en CADA petición, así desactivar una cuenta o suspender un
 * despacho surte efecto de inmediato, sin esperar a que venza la sesión.
 */
export function crearObtenerContextoDeSesion(deps: DependenciasDeContexto) {
  return async function obtenerContextoDeSesion(): Promise<
    Result<ContextoDeSesion, ErrorDeSesion>
  > {
    const sesion = await deps.autenticacion.sesionActual();
    if (!sesion) return err(new ErrorNoAutenticado());

    const usuario = await deps.usuarios.buscarPorId(sesion.usuarioId);
    if (!usuario) return err(new ErrorNoAutenticado());

    const base = { usuarioId: usuario.id, nombre: usuario.nombre, email: usuario.email };
    if (usuario.esSuperadmin) {
      return ok({ ...base, perfil: 'superadmin', despacho: null, membresiaId: null });
    }

    // Primero el despacho activo de la sesión; si dejó de ser válido, otro disponible.
    if (sesion.despachoActivoId) {
      const datos = await deps.membresias.buscarDelUsuario(usuario.id, sesion.despachoActivoId);
      if (datos?.miembro.activa && datos.despacho.estado === 'ACTIVO') {
        return ok({
          ...base,
          perfil: datos.miembro.rol,
          despacho: { id: datos.despacho.id, nombre: datos.despacho.nombre },
          membresiaId: datos.miembro.membresiaId,
        });
      }
    }

    const acceso = await deps.membresias.primerDespachoDisponible(usuario.id);
    if (acceso.despachoId === null) {
      return acceso.motivo === 'SUSPENDIDO'
        ? err(new ErrorDespachoSuspendido())
        : err(new ErrorCuentaSinAcceso(`Usuario ${usuario.id} sin membresía activa`));
    }
    const datos = await deps.membresias.buscarDelUsuario(usuario.id, acceso.despachoId);
    if (!datos) return err(new ErrorCuentaSinAcceso(`Membresía de ${usuario.id} no encontrada`));
    return ok({
      ...base,
      perfil: datos.miembro.rol,
      despacho: { id: datos.despacho.id, nombre: datos.despacho.nombre },
      membresiaId: datos.miembro.membresiaId,
    });
  };
}

export type ObtenerContextoDeSesion = ReturnType<typeof crearObtenerContextoDeSesion>;

/** Verifica un permiso de la matriz del §5 para el contexto de la sesión. */
export function autorizarContexto(
  contexto: ContextoDeSesion,
  accion: Accion,
  recurso?: RelacionConRecurso,
): Result<void, ErrorSinPermiso> {
  return autorizar(contexto.perfil satisfies Perfil, accion, recurso);
}

/** Exige que la sesión pertenezca a un despacho (no superadmin) y tenga el permiso. */
export function exigirMiembroConPermiso(
  contexto: ContextoDeSesion,
  accion: Accion,
): Result<ContextoMiembro, ErrorSinPermiso> {
  const permiso = autorizarContexto(contexto, accion);
  if (!permiso.ok) return permiso;
  if (contexto.perfil === 'superadmin') {
    return err(new ErrorSinPermiso(undefined, 'Acción de despacho pedida por el superadmin'));
  }
  return ok(contexto);
}
