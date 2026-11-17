import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { ok, type Result } from '@/shared/domain/result';
import type { PermisosSobreProceso } from '../domain/reglas';
import { cargarProcesoAutorizado } from './acceso-a-proceso';
import type { DetalleDeProceso, RepositorioDeProcesos } from './puertos';

export interface FichaDeProceso {
  readonly proceso: DetalleDeProceso;
  /** Qué acciones mostrar. La interfaz las usa solo para decidir qué ver; el servidor verifica. */
  readonly permisos: PermisosSobreProceso;
}

/** Ficha de un proceso: datos, asignaciones, plataformas y línea de tiempo de actuaciones. */
export function crearConsultarProceso(deps: { readonly procesos: RepositorioDeProcesos }) {
  return async function consultarProceso(
    contexto: ContextoDeSesion,
    procesoId: string,
  ): Promise<Result<FichaDeProceso, AppError>> {
    const cargado = await cargarProcesoAutorizado(deps.procesos, contexto, procesoId, 'ver');
    if (!cargado.ok) return cargado;
    return ok({ proceso: cargado.value.proceso, permisos: cargado.value.permisos });
  };
}
