import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { alcanceDe, puede } from '@/modules/usuarios/domain/permisos';
import type { AppError } from '@/shared/domain/app-error';
import { ok, type Result } from '@/shared/domain/result';
import type { MiembroAsignable } from '../domain/reglas';
import type {
  AlcanceDeLista,
  DirectorioDelDespacho,
  FiltrosDeProcesos,
  PaginaDeProcesos,
  RepositorioDeProcesos,
} from './puertos';

export interface ListaDeProcesos extends PaginaDeProcesos {
  /** Si la persona solo ve los procesos en los que participa (para explicarlo en la interfaz). */
  readonly soloPropios: boolean;
  readonly puedeRegistrar: boolean;
}

/**
 * Lista de procesos con búsqueda y filtros. El alcance sale de la matriz del §5: el
 * administrador ve todo el despacho; abogado y asistente, solo los procesos en los que participan.
 */
export function crearListarProcesos(deps: { readonly procesos: RepositorioDeProcesos }) {
  return async function listarProcesos(
    contexto: ContextoDeSesion,
    filtros: FiltrosDeProcesos,
  ): Promise<Result<ListaDeProcesos, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_CONSULTAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;

    const alcance: AlcanceDeLista =
      alcanceDe(actor.perfil, 'PROCESOS_CONSULTAR') === 'TODOS'
        ? { tipo: 'DESPACHO' }
        : { tipo: 'PARTICIPANTE', membresiaId: actor.membresiaId };

    const pagina = await deps.procesos.listar(actor.despacho.id, filtros, alcance);
    return ok({
      ...pagina,
      soloPropios: alcance.tipo === 'PARTICIPANTE',
      puedeRegistrar: puede(actor.perfil, 'PROCESOS_REGISTRAR_EDITAR'),
    });
  };
}

export interface OpcionesDeProcesos {
  /** Personas activas del despacho (para asignar y filtrar por responsable). */
  readonly miembros: readonly MiembroAsignable[];
  readonly etiquetas: readonly { readonly id: string; readonly nombre: string }[];
  /** Solo el administrador elige responsable y asignados al registrar. */
  readonly puedeElegirResponsable: boolean;
}

/** Datos para los formularios y filtros de procesos. */
export function crearObtenerOpcionesDeProcesos(deps: {
  readonly directorio: DirectorioDelDespacho;
}) {
  return async function obtenerOpcionesDeProcesos(
    contexto: ContextoDeSesion,
  ): Promise<Result<OpcionesDeProcesos, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_CONSULTAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const [miembros, etiquetas] = await Promise.all([
      deps.directorio.miembros(actor.despacho.id),
      deps.directorio.etiquetas(actor.despacho.id),
    ]);
    return ok({
      miembros: miembros.filter((m) => m.activa),
      etiquetas,
      puedeElegirResponsable: actor.perfil === 'administrador',
    });
  };
}
