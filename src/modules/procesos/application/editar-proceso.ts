import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorIdentificadorBloqueado } from '../domain/errores';
import { claveDeEtiqueta, type DatosDeProceso } from '../domain/proceso';
import { cargarProcesoAutorizado } from './acceso-a-proceso';
import {
  duplicadoPorCarrera,
  errorDeDuplicado,
  identificadoresDe,
  type DependenciasDeEscritura,
} from './registrar-proceso';

/** Forma comparable de los datos (texto plano): sirve para lo guardado y lo recibido. */
interface DatosComparables {
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly etiquetas: readonly string[];
}

function camposCambiados(antes: DatosComparables, despues: DatosComparables): string[] {
  const etiquetasAntes = antes.etiquetas.map(claveDeEtiqueta).sort().join('|');
  const etiquetasDespues = despues.etiquetas.map(claveDeEtiqueta).sort().join('|');
  return [
    antes.radicado !== despues.radicado && 'radicado',
    antes.nunc !== despues.nunc && 'nunc',
    antes.alias !== despues.alias && 'alias',
    antes.cliente !== despues.cliente && 'cliente',
    etiquetasAntes !== etiquetasDespues && 'etiquetas',
  ].filter((campo): campo is string => campo !== false);
}

/**
 * Edita los datos de un proceso. El radicado y el NUNC solo se pueden corregir mientras el
 * proceso no tenga actuaciones: después, cambiarlos mezclaría expedientes distintos.
 */
export function crearEditarProceso(deps: DependenciasDeEscritura) {
  return async function editarProceso(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly procesoId: string;
      readonly datos: DatosDeProceso;
      readonly ip: string | null;
    },
  ): Promise<Result<void, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'editar',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;
    const despachoId = actor.despacho.id;

    const anterior: DatosComparables = {
      ...proceso,
      etiquetas: proceso.etiquetas.map((e) => e.nombre),
    };
    const cambios = camposCambiados(anterior, solicitud.datos);
    if (cambios.length === 0) return ok(undefined);

    const cambiaronIdentificadores = cambios.includes('radicado') || cambios.includes('nunc');
    if (cambiaronIdentificadores) {
      if (proceso.totalActuaciones > 0) return err(new ErrorIdentificadorBloqueado());
      const existentes = await deps.procesos.buscarPorIdentificadores(
        despachoId,
        identificadoresDe(solicitud.datos),
      );
      const duplicado = errorDeDuplicado(
        solicitud.datos,
        existentes.filter((p) => p.id !== proceso.id),
      );
      if (duplicado) return err(duplicado);
    }

    const actualizado = await deps.procesos.actualizar(despachoId, proceso.id, solicitud.datos, {
      cambiaronIdentificadores,
    });
    if (!actualizado.ok) return err(duplicadoPorCarrera(solicitud.datos));

    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'PROCESO_EDITADO',
      entidad: 'Proceso',
      entidadId: proceso.id,
      datos: { campos: cambios.join(',') },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}
