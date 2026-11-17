import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { type AppError, ErrorSinPermiso } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorProcesoDuplicado } from '../domain/errores';
import type { Asignacion, DatosDeProceso } from '../domain/proceso';
import { asignacionDelCreador, validarAsignado, validarResponsable } from '../domain/reglas';
import type { DirectorioDelDespacho, ProcesoExistente, RepositorioDeProcesos } from './puertos';

export interface DependenciasDeEscritura {
  readonly procesos: RepositorioDeProcesos;
  readonly directorio: DirectorioDelDespacho;
  readonly auditoria: RegistradorDeAuditoria;
}

/** Error de duplicado para el primer identificador que ya usa otro proceso. */
export function errorDeDuplicado(
  datos: Pick<DatosDeProceso, 'radicado' | 'nunc'>,
  existentes: readonly ProcesoExistente[],
): ErrorProcesoDuplicado | null {
  if (datos.radicado && existentes.some((p) => p.radicado === datos.radicado)) {
    return new ErrorProcesoDuplicado('RADICADO', datos.radicado);
  }
  if (datos.nunc && existentes.some((p) => p.nunc === datos.nunc)) {
    return new ErrorProcesoDuplicado('NUNC', datos.nunc);
  }
  return null;
}

/** La base rechazó la escritura por un identificador repetido (lo registró alguien más). */
export function duplicadoPorCarrera(
  datos: Pick<DatosDeProceso, 'radicado' | 'nunc'>,
): ErrorProcesoDuplicado {
  return datos.radicado
    ? new ErrorProcesoDuplicado('RADICADO', datos.radicado)
    : new ErrorProcesoDuplicado('NUNC', datos.nunc ?? '');
}

export function identificadoresDe(datos: Pick<DatosDeProceso, 'radicado' | 'nunc'>) {
  return {
    radicados: datos.radicado ? [datos.radicado] : [],
    nuncs: datos.nunc ? [datos.nunc] : [],
  };
}

/**
 * Registra un proceso. Quien lo registra queda asignado para poder seguirlo (abogado como
 * responsable, asistente como apoyo). Solo el administrador elige responsable y asignados.
 */
export function crearRegistrarProceso(deps: DependenciasDeEscritura) {
  return async function registrarProceso(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly datos: DatosDeProceso;
      readonly responsableId: string | null;
      readonly asignadosIds: readonly string[];
      readonly ip: string | null;
    },
  ): Promise<Result<{ readonly id: string }, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_REGISTRAR_EDITAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const despachoId = actor.despacho.id;

    const eligeAsignaciones = solicitud.responsableId !== null || solicitud.asignadosIds.length > 0;
    if (eligeAsignaciones && actor.perfil !== 'administrador') {
      return err(
        new ErrorSinPermiso(
          'Solo el administrador del despacho elige el responsable y las personas asignadas al registrar un proceso.',
        ),
      );
    }

    const asignaciones: Asignacion[] = [];
    const delCreador = asignacionDelCreador(actor.perfil, actor.membresiaId);
    if (delCreador) asignaciones.push(delCreador);

    if (eligeAsignaciones) {
      const miembros = await deps.directorio.miembros(despachoId);
      const buscar = (id: string) => miembros.find((m) => m.membresiaId === id) ?? null;
      if (solicitud.responsableId !== null) {
        const responsable = validarResponsable(buscar(solicitud.responsableId));
        if (!responsable.ok) return responsable;
        asignaciones.push({ membresiaId: solicitud.responsableId, tipo: 'RESPONSABLE' });
      }
      for (const id of new Set(solicitud.asignadosIds)) {
        if (id === solicitud.responsableId) continue;
        const asignado = validarAsignado(buscar(id));
        if (!asignado.ok) return asignado;
        asignaciones.push({ membresiaId: id, tipo: 'ASIGNADO' });
      }
    }

    const existentes = await deps.procesos.buscarPorIdentificadores(
      despachoId,
      identificadoresDe(solicitud.datos),
    );
    const duplicado = errorDeDuplicado(solicitud.datos, existentes);
    if (duplicado) return err(duplicado);

    const creado = await deps.procesos.registrar(despachoId, { ...solicitud.datos, asignaciones });
    // Otra persona registró el mismo número entre la verificación y la escritura.
    if (!creado.ok) return err(duplicadoPorCarrera(solicitud.datos));

    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'PROCESO_REGISTRADO',
      entidad: 'Proceso',
      entidadId: creado.value.id,
      datos: { radicado: solicitud.datos.radicado, nunc: solicitud.datos.nunc },
      ip: solicitud.ip,
    });
    return ok(creado.value);
  };
}
