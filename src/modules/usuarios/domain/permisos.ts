import { ErrorSinPermiso } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import type { RolDeDespacho } from './rol-de-despacho';

/**
 * Matriz de permisos centralizada (§5 de CLAUDE.md). Es la ÚNICA fuente de verdad: los casos
 * de uso la consultan en el servidor antes de actuar; la interfaz solo la usa para decidir qué
 * mostrar, nunca como control de acceso.
 */

/** Quién actúa: el operador de LURIS o un miembro de un despacho con su rol. */
export type Perfil = 'superadmin' | RolDeDespacho;

export const PERFILES = [
  'superadmin',
  'administrador',
  'abogado',
  'asistente',
] as const satisfies readonly Perfil[];

/** Acciones de la matriz del §5, una por fila. */
export const ACCIONES = [
  'DESPACHOS_GESTIONAR',
  'CUENTAS_GESTIONAR',
  'ROLES_ASIGNAR',
  'CREDENCIALES_GESTIONAR',
  'PROCESOS_REGISTRAR_EDITAR',
  'PROCESOS_CONSULTAR',
  'CONSULTA_MASIVA',
  'NOTIFICACIONES_CONFIGURAR',
  'AUDITORIA_VER',
] as const;

export type Accion = (typeof ACCIONES)[number];

/**
 * Hasta dónde llega un permiso:
 * - NINGUNO: no puede.
 * - TODOS: sobre todo lo del ámbito (el despacho, o la plataforma para el superadmin).
 * - PROPIOS: solo sobre lo suyo (procesos en los que participa, sus credenciales, sus ajustes).
 * - ASIGNADOS: solo sobre los procesos que le asignaron.
 */
export type Alcance = 'NINGUNO' | 'TODOS' | 'PROPIOS' | 'ASIGNADOS';

export const MATRIZ_DE_PERMISOS: Readonly<Record<Accion, Readonly<Record<Perfil, Alcance>>>> = {
  DESPACHOS_GESTIONAR: {
    superadmin: 'TODOS',
    administrador: 'NINGUNO',
    abogado: 'NINGUNO',
    asistente: 'NINGUNO',
  },
  CUENTAS_GESTIONAR: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'NINGUNO',
    asistente: 'NINGUNO',
  },
  ROLES_ASIGNAR: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'NINGUNO',
    asistente: 'NINGUNO',
  },
  CREDENCIALES_GESTIONAR: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'PROPIOS',
    asistente: 'NINGUNO',
  },
  PROCESOS_REGISTRAR_EDITAR: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'PROPIOS',
    asistente: 'ASIGNADOS',
  },
  PROCESOS_CONSULTAR: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'PROPIOS',
    asistente: 'ASIGNADOS',
  },
  CONSULTA_MASIVA: {
    superadmin: 'NINGUNO',
    administrador: 'TODOS',
    abogado: 'TODOS',
    asistente: 'TODOS',
  },
  NOTIFICACIONES_CONFIGURAR: {
    superadmin: 'NINGUNO',
    administrador: 'PROPIOS',
    abogado: 'PROPIOS',
    asistente: 'PROPIOS',
  },
  AUDITORIA_VER: {
    superadmin: 'TODOS',
    administrador: 'TODOS',
    abogado: 'NINGUNO',
    asistente: 'NINGUNO',
  },
};

/**
 * Relación del actor con el recurso concreto sobre el que actúa:
 * - esPropio: el recurso es suyo (es responsable o participa del proceso, la credencial es suya…).
 * - estaAsignado: le asignaron el proceso.
 * Si se omite, se evalúa solo si el perfil tiene algún alcance sobre la acción.
 */
export interface RelacionConRecurso {
  readonly esPropio: boolean;
  readonly estaAsignado: boolean;
}

export function alcanceDe(perfil: Perfil, accion: Accion): Alcance {
  return MATRIZ_DE_PERMISOS[accion][perfil];
}

/** Indica si el perfil puede realizar la acción (sobre el recurso, si se indica). */
export function puede(perfil: Perfil, accion: Accion, recurso?: RelacionConRecurso): boolean {
  const alcance = alcanceDe(perfil, accion);
  switch (alcance) {
    case 'NINGUNO':
      return false;
    case 'TODOS':
      return true;
    case 'PROPIOS':
      return recurso === undefined || recurso.esPropio;
    case 'ASIGNADOS':
      return recurso === undefined || recurso.estaAsignado;
  }
}

/** Como `puede`, pero devuelve un `ErrorSinPermiso` listo para mostrar si no está permitido. */
export function autorizar(
  perfil: Perfil,
  accion: Accion,
  recurso?: RelacionConRecurso,
): Result<void, ErrorSinPermiso> {
  if (puede(perfil, accion, recurso)) return ok(undefined);
  return err(new ErrorSinPermiso(undefined, `Perfil "${perfil}" sin permiso para ${accion}`));
}
