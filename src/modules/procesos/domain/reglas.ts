import { puede, type Perfil, type RelacionConRecurso } from '@/modules/usuarios/domain/permisos';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorAsignacionInvalida } from './errores';
import type { Asignacion } from './proceso';

/**
 * Reglas de acceso a un proceso concreto (§5):
 * - Administrador: todos los procesos del despacho.
 * - Abogado: los suyos (es responsable o participa).
 * - Asistente: los que le asignaron.
 * En la práctica, "participar" y "estar asignado" son lo mismo: tener una asignación.
 */
export function relacionConProceso(
  asignaciones: readonly Asignacion[],
  membresiaId: string,
): RelacionConRecurso {
  const participa = asignaciones.some((a) => a.membresiaId === membresiaId);
  return { esPropio: participa, estaAsignado: participa };
}

export function esResponsable(asignaciones: readonly Asignacion[], membresiaId: string): boolean {
  return asignaciones.some((a) => a.membresiaId === membresiaId && a.tipo === 'RESPONSABLE');
}

export interface PermisosSobreProceso {
  readonly ver: boolean;
  readonly editar: boolean;
  /** Elegir o quitar al abogado responsable. */
  readonly cambiarResponsable: boolean;
  /** Agregar o quitar personas asignadas (apoyo). */
  readonly gestionarAsignados: boolean;
}

/**
 * Qué puede hacer una persona con un proceso. Cambiar el responsable es del administrador; el
 * abogado responsable puede sumar o quitar apoyo en sus procesos; el asistente no reparte trabajo.
 */
export function permisosSobreProceso(
  perfil: Perfil,
  asignaciones: readonly Asignacion[],
  membresiaId: string,
): PermisosSobreProceso {
  const relacion = relacionConProceso(asignaciones, membresiaId);
  const ver = puede(perfil, 'PROCESOS_CONSULTAR', relacion);
  const editar = ver && puede(perfil, 'PROCESOS_REGISTRAR_EDITAR', relacion);
  const esAdministrador = perfil === 'administrador';
  return {
    ver,
    editar,
    cambiarResponsable: editar && esAdministrador,
    gestionarAsignados:
      editar &&
      (esAdministrador || (perfil === 'abogado' && esResponsable(asignaciones, membresiaId))),
  };
}

/**
 * Asignación automática de quien registra un proceso, para que pueda seguir viéndolo: el
 * abogado queda como responsable y el asistente como asignado. El administrador ve todo.
 */
export function asignacionDelCreador(perfil: Perfil, membresiaId: string): Asignacion | null {
  if (perfil === 'abogado') return { membresiaId, tipo: 'RESPONSABLE' };
  if (perfil === 'asistente') return { membresiaId, tipo: 'ASIGNADO' };
  return null;
}

export interface MiembroAsignable {
  readonly membresiaId: string;
  readonly nombre: string;
  readonly rol: RolDeDespacho;
  readonly activa: boolean;
}

/** El responsable debe ser un abogado o administrador con la cuenta activa. */
export function validarResponsable(
  miembro: MiembroAsignable | null,
): Result<MiembroAsignable, ErrorAsignacionInvalida> {
  if (!miembro)
    return err(new ErrorAsignacionInvalida('No encontramos a esa persona en tu despacho.'));
  if (!miembro.activa) {
    return err(
      new ErrorAsignacionInvalida(
        `La cuenta de ${miembro.nombre} está desactivada; reactívala antes de asignarle procesos.`,
      ),
    );
  }
  if (miembro.rol === 'asistente') {
    return err(
      new ErrorAsignacionInvalida(
        'El responsable debe ser un abogado o un administrador del despacho. A un asistente asígnalo como apoyo.',
      ),
    );
  }
  return ok(miembro);
}

/** Cualquier persona activa del despacho puede apoyar el seguimiento de un proceso. */
export function validarAsignado(
  miembro: MiembroAsignable | null,
): Result<MiembroAsignable, ErrorAsignacionInvalida> {
  if (!miembro)
    return err(new ErrorAsignacionInvalida('No encontramos a esa persona en tu despacho.'));
  if (!miembro.activa) {
    return err(
      new ErrorAsignacionInvalida(
        `La cuenta de ${miembro.nombre} está desactivada; reactívala antes de asignarle procesos.`,
      ),
    );
  }
  return ok(miembro);
}
