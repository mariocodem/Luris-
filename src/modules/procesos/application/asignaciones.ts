import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorAsignacionInvalida } from '../domain/errores';
import { validarAsignado, validarResponsable } from '../domain/reglas';
import { cargarProcesoAutorizado } from './acceso-a-proceso';
import type { DependenciasDeEscritura } from './registrar-proceso';

interface SolicitudDeAsignacion {
  readonly procesoId: string;
  readonly membresiaId: string;
  readonly ip: string | null;
}

async function buscarMiembro(
  deps: DependenciasDeEscritura,
  despachoId: string,
  membresiaId: string,
) {
  const miembros = await deps.directorio.miembros(despachoId);
  return miembros.find((m) => m.membresiaId === membresiaId) ?? null;
}

/** Elige el abogado responsable de un proceso, o lo deja sin responsable (null). */
export function crearAsignarResponsable(deps: DependenciasDeEscritura) {
  return async function asignarResponsable(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly procesoId: string;
      readonly membresiaId: string | null;
      readonly ip: string | null;
    },
  ): Promise<Result<void, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'cambiarResponsable',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;
    const despachoId = actor.despacho.id;

    const actual = proceso.asignaciones.find((a) => a.tipo === 'RESPONSABLE') ?? null;
    if ((actual?.membresiaId ?? null) === solicitud.membresiaId) return ok(undefined);

    if (solicitud.membresiaId !== null) {
      const valido = validarResponsable(
        await buscarMiembro(deps, despachoId, solicitud.membresiaId),
      );
      if (!valido.ok) return valido;
    }

    await deps.procesos.establecerResponsable(despachoId, proceso.id, solicitud.membresiaId);
    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'PROCESO_RESPONSABLE_CAMBIADO',
      entidad: 'Proceso',
      entidadId: proceso.id,
      datos: {
        responsableAnterior: actual?.membresiaId ?? null,
        responsableNuevo: solicitud.membresiaId,
      },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}

/** Suma a una persona activa del despacho como apoyo en el seguimiento del proceso. */
export function crearAgregarAsignado(deps: DependenciasDeEscritura) {
  return async function agregarAsignado(
    contexto: ContextoDeSesion,
    solicitud: SolicitudDeAsignacion,
  ): Promise<Result<void, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'gestionarAsignados',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;
    const despachoId = actor.despacho.id;

    const miembro = validarAsignado(await buscarMiembro(deps, despachoId, solicitud.membresiaId));
    if (!miembro.ok) return miembro;
    if (proceso.asignaciones.some((a) => a.membresiaId === solicitud.membresiaId)) {
      return err(new ErrorAsignacionInvalida(`${miembro.value.nombre} ya sigue este proceso.`));
    }

    await deps.procesos.agregarAsignado(despachoId, proceso.id, solicitud.membresiaId);
    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'PROCESO_ASIGNACION_AGREGADA',
      entidad: 'Proceso',
      entidadId: proceso.id,
      datos: { membresiaId: solicitud.membresiaId },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}

/** Quita a una persona de apoyo. Al responsable se le cambia con `asignarResponsable`. */
export function crearQuitarAsignado(deps: DependenciasDeEscritura) {
  return async function quitarAsignado(
    contexto: ContextoDeSesion,
    solicitud: SolicitudDeAsignacion,
  ): Promise<Result<void, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'gestionarAsignados',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;

    const asignacion = proceso.asignaciones.find((a) => a.membresiaId === solicitud.membresiaId);
    if (!asignacion) return ok(undefined);
    if (asignacion.tipo === 'RESPONSABLE') {
      return err(
        new ErrorAsignacionInvalida(
          'Esa persona es la responsable del proceso. Para quitarla, el administrador debe elegir otro responsable.',
        ),
      );
    }

    await deps.procesos.quitarAsignado(actor.despacho.id, proceso.id, solicitud.membresiaId);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'PROCESO_ASIGNACION_QUITADA',
      entidad: 'Proceso',
      entidadId: proceso.id,
      datos: { membresiaId: solicitud.membresiaId },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}
