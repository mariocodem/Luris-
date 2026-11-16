import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import { type AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import type { Invitacion } from '../domain/invitacion';
import {
  validarCambioDeRol,
  validarDesactivacion,
  validarReactivacion,
  type MiembroObjetivo,
} from '../domain/reglas-de-cuenta';
import type { RolDeDespacho } from '../domain/rol-de-despacho';
import { exigirMiembroConPermiso, type ContextoDeSesion } from './contexto-de-sesion';
import type {
  MiembroDelDespacho,
  RepositorioDeInvitaciones,
  RepositorioDeMembresias,
} from './puertos';

export interface DependenciasDeCuentas {
  readonly membresias: RepositorioDeMembresias;
  readonly invitaciones: RepositorioDeInvitaciones;
  readonly auditoria: RegistradorDeAuditoria;
}

export interface UsuariosDelDespacho {
  readonly miembros: readonly MiembroDelDespacho[];
  readonly invitacionesPendientes: readonly Invitacion[];
}

/** Panel del administrador: personas del despacho e invitaciones pendientes. */
export function crearListarUsuariosDelDespacho(deps: DependenciasDeCuentas) {
  return async function listarUsuariosDelDespacho(
    contexto: ContextoDeSesion,
  ): Promise<Result<UsuariosDelDespacho, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CUENTAS_GESTIONAR');
    if (!permiso.ok) return permiso;
    const despachoId = permiso.value.despacho.id;
    const [miembros, invitacionesPendientes] = await Promise.all([
      deps.membresias.listar(despachoId),
      deps.invitaciones.listar(despachoId, 'PENDIENTE'),
    ]);
    return ok({ miembros, invitacionesPendientes });
  };
}

async function cargarObjetivo(
  deps: DependenciasDeCuentas,
  despachoId: string,
  membresiaId: string,
): Promise<Result<MiembroDelDespacho & MiembroObjetivo, ErrorNoEncontrado>> {
  const miembro = await deps.membresias.buscar(despachoId, membresiaId);
  if (!miembro) {
    return err(new ErrorNoEncontrado('No encontramos a esa persona en tu despacho.'));
  }
  return ok(miembro);
}

export function crearCambiarRol(deps: DependenciasDeCuentas) {
  return async function cambiarRol(
    contexto: ContextoDeSesion,
    datos: {
      readonly membresiaId: string;
      readonly rol: RolDeDespacho;
      readonly ip: string | null;
    },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'ROLES_ASIGNAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;

    const objetivo = await cargarObjetivo(deps, actor.despacho.id, datos.membresiaId);
    if (!objetivo.ok) return objetivo;
    const regla = validarCambioDeRol(objetivo.value, datos.rol, {
      actorMembresiaId: actor.membresiaId,
      administradoresActivos: await deps.membresias.contarAdministradoresActivos(actor.despacho.id),
    });
    if (!regla.ok) return regla;

    await deps.membresias.cambiarRol(actor.despacho.id, datos.membresiaId, datos.rol);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'ROL_CAMBIADO',
      entidad: 'Membresia',
      entidadId: datos.membresiaId,
      datos: { rolAnterior: objetivo.value.rol, rolNuevo: datos.rol },
      ip: datos.ip,
    });
    return ok(undefined);
  };
}

/** Desactivar o reactivar la cuenta de una persona en el despacho (no se borra nada). */
export function crearCambiarEstadoDeCuenta(deps: DependenciasDeCuentas) {
  return async function cambiarEstadoDeCuenta(
    contexto: ContextoDeSesion,
    datos: { readonly membresiaId: string; readonly activa: boolean; readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CUENTAS_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;

    const objetivo = await cargarObjetivo(deps, actor.despacho.id, datos.membresiaId);
    if (!objetivo.ok) return objetivo;
    const regla = datos.activa
      ? validarReactivacion(objetivo.value)
      : validarDesactivacion(objetivo.value, {
          actorMembresiaId: actor.membresiaId,
          administradoresActivos: await deps.membresias.contarAdministradoresActivos(
            actor.despacho.id,
          ),
        });
    if (!regla.ok) return regla;

    await deps.membresias.cambiarActiva(actor.despacho.id, datos.membresiaId, datos.activa);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: datos.activa ? 'CUENTA_REACTIVADA' : 'CUENTA_DESACTIVADA',
      entidad: 'Membresia',
      entidadId: datos.membresiaId,
      ip: datos.ip,
    });
    return ok(undefined);
  };
}
