import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { ok, type Result } from '@/shared/domain/result';
import { cargarProcesoAutorizado } from './acceso-a-proceso';
import type { DependenciasDeEscritura } from './registrar-proceso';

/**
 * Archiva un proceso (sale de la lista de activos y no se volverá a consultar) o lo restaura.
 * No se borra nada: el historial de actuaciones se conserva.
 */
export function crearCambiarEstadoDeProceso(deps: DependenciasDeEscritura) {
  return async function cambiarEstadoDeProceso(
    contexto: ContextoDeSesion,
    solicitud: { readonly procesoId: string; readonly activo: boolean; readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'editar',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;
    if (proceso.activo === solicitud.activo) return ok(undefined);

    await deps.procesos.cambiarActivo(actor.despacho.id, proceso.id, solicitud.activo);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: solicitud.activo ? 'PROCESO_RESTAURADO' : 'PROCESO_ARCHIVADO',
      entidad: 'Proceso',
      entidadId: proceso.id,
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}
