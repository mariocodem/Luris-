import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
  type ContextoMiembro,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { type AppError, ErrorSinPermiso } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorProcesoNoEncontrado } from '../domain/errores';
import { permisosSobreProceso, type PermisosSobreProceso } from '../domain/reglas';
import type { DetalleDeProceso, RepositorioDeProcesos } from './puertos';

export type Requisito = keyof PermisosSobreProceso;

const SIN_PERMISO: Readonly<Record<Exclude<Requisito, 'ver'>, string>> = {
  editar:
    'Puedes ver este proceso, pero no editarlo. Pide al administrador del despacho que te lo asigne.',
  cambiarResponsable: 'Solo el administrador del despacho puede cambiar el abogado responsable.',
  gestionarAsignados:
    'Solo el administrador o el abogado responsable pueden asignar personas a este proceso.',
};

export interface ProcesoAutorizado {
  readonly actor: ContextoMiembro;
  readonly proceso: DetalleDeProceso;
  readonly permisos: PermisosSobreProceso;
}

/**
 * Carga un proceso del despacho de la sesión y verifica en el servidor que la persona pueda
 * hacer lo pedido (§5). Si no puede verlo, responde "no encontrado": no revela que existe.
 */
export async function cargarProcesoAutorizado(
  procesos: RepositorioDeProcesos,
  contexto: ContextoDeSesion,
  procesoId: string,
  requisito: Requisito,
): Promise<Result<ProcesoAutorizado, AppError>> {
  const miembro = exigirMiembroConPermiso(contexto, 'PROCESOS_CONSULTAR');
  if (!miembro.ok) return miembro;
  const actor = miembro.value;

  const proceso = await procesos.buscar(actor.despacho.id, procesoId);
  if (!proceso) return err(new ErrorProcesoNoEncontrado(`Proceso ${procesoId} inexistente`));

  const permisos = permisosSobreProceso(actor.perfil, proceso.asignaciones, actor.membresiaId);
  if (!permisos.ver) {
    return err(
      new ErrorProcesoNoEncontrado(
        `Proceso ${procesoId} fuera del alcance de ${actor.membresiaId}`,
      ),
    );
  }
  if (requisito !== 'ver' && !permisos[requisito]) {
    return err(
      new ErrorSinPermiso(
        SIN_PERMISO[requisito],
        `${actor.perfil} sin ${requisito} en ${procesoId}`,
      ),
    );
  }
  return ok({ actor, proceso, permisos });
}
