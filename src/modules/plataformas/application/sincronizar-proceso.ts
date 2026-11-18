import { err, ok, type Result } from '@/shared/domain/result';
import type { ErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { ContextoConsulta, PlataformaJudicial } from '../domain/puertos';
import type { ResumenDeSincronizacion } from '../domain/sincronizacion';
import { type DependenciasDeGuardado, guardarConsulta } from './guardar-consulta';
import type { SolicitudDeSincronizacion } from './puertos';

export interface DependenciasDeSincronizacion extends DependenciasDeGuardado {
  readonly plataformas: ReadonlyMap<CodigoPlataforma, PlataformaJudicial>;
}

/**
 * Consulta un proceso en una plataforma automática y guarda lo nuevo (§6, Fase 5). Lo ejecuta el
 * worker: no verifica permisos, eso lo hace quien encola (ver `solicitar-consulta.ts`).
 *
 * Un fallo de la plataforma queda registrado como estado de la última consulta y se devuelve
 * como error: el worker decide si reintentar según `error.transitorio`.
 */
export function crearSincronizarProceso(deps: DependenciasDeSincronizacion) {
  return async function sincronizarProceso(
    solicitud: SolicitudDeSincronizacion,
    ctx: ContextoConsulta,
  ): Promise<Result<ResumenDeSincronizacion, ErrorPlataforma>> {
    const { despachoId, procesoId, plataforma: codigo } = solicitud;
    const plataforma = deps.plataformas.get(codigo);
    if (!plataforma) return ok({ tipo: 'OMITIDO', motivo: 'PLATAFORMA_NO_CONFIGURADA' });

    const proceso = await deps.repositorio.obtenerProceso(despachoId, procesoId);
    if (!proceso) return ok({ tipo: 'OMITIDO', motivo: 'PROCESO_NO_ENCONTRADO' });
    const id = plataforma.identificador === 'RADICADO' ? proceso.radicado : proceso.nunc;
    if (!id) return ok({ tipo: 'OMITIDO', motivo: 'SIN_IDENTIFICADOR' });

    // Las plataformas con ingreso (SIUGJ) eligen la cuenta según el proceso.
    const consulta = await plataforma.consultar(id, { ...ctx, alcance: { despachoId, procesoId } });
    if (!consulta.ok) {
      await deps.repositorio.registrarFallo(
        despachoId,
        procesoId,
        codigo,
        consulta.error.codigo,
        deps.reloj.ahora(),
      );
      return err(consulta.error);
    }
    return ok(await guardarConsulta(deps, despachoId, procesoId, consulta.value));
  };
}

export type SincronizarProceso = ReturnType<typeof crearSincronizarProceso>;
