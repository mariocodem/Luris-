import type { ErrorPlataforma } from '@/modules/plataformas/domain/errores';
import type { CodigoPlataforma } from '@/modules/plataformas/domain/plataforma';
import type {
  ContextoConsulta,
  DescargadorDeDocumentos,
} from '@/modules/plataformas/domain/puertos';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { detectarTipoDeArchivo } from '../domain/tipo-de-archivo';
import type { AlmacenDeArchivos, RepositorioDeDocumentos } from './puertos';

export interface DependenciasDeObtencion {
  readonly descargadores: ReadonlyMap<CodigoPlataforma, DescargadorDeDocumentos>;
  readonly documentos: RepositorioDeDocumentos;
  readonly almacen: AlmacenDeArchivos;
  readonly reloj: { ahora(): Date };
  readonly tamanoMaximoBytes: number;
  readonly logger: Logger;
}

export interface ResumenDeDocumentos {
  readonly descargados: number;
  readonly noDisponibles: number;
}

/**
 * Trae los documentos de una actuación (§8): registra sus referencias, descarga los pendientes,
 * valida el tipo real y el tamaño, y los guarda deduplicados por SHA-256. Lo ejecuta el worker.
 *
 * Un documento que la plataforma no entrega, demasiado grande o de un formato no admitido queda
 * como «no disponible» (con su referencia, para mostrarlo y reintentarlo). Un fallo pasajero se
 * devuelve como error para que la cola reintente.
 */
export function crearObtenerDocumentos(deps: DependenciasDeObtencion) {
  return async function obtenerDocumentos(
    solicitud: { readonly despachoId: string; readonly actuacionId: string },
    ctx: ContextoConsulta,
  ): Promise<Result<ResumenDeDocumentos, ErrorPlataforma>> {
    const { despachoId, actuacionId } = solicitud;
    const actuacion = await deps.documentos.actuacionDeOrigen(despachoId, actuacionId);
    const descargador = actuacion ? deps.descargadores.get(actuacion.plataforma) : undefined;
    if (!actuacion?.idExterno || !descargador) return ok({ descargados: 0, noDisponibles: 0 });
    // Las plataformas con ingreso (SIUGJ) eligen la cuenta según el proceso.
    ctx = { ...ctx, alcance: { despachoId, procesoId: actuacion.procesoId } };

    const referencias = await descargador.listar(actuacion.idExterno, ctx);
    if (!referencias.ok) return err(referencias.error);
    await deps.documentos.registrarReferencias(despachoId, actuacionId, referencias.value);

    let descargados = 0;
    let noDisponibles = 0;
    for (const documento of await deps.documentos.pendientes(despachoId, actuacionId)) {
      const archivo = await descargador.descargar(documento.idExterno, deps.tamanoMaximoBytes, ctx);
      if (!archivo.ok) {
        if (archivo.error !== 'DEMASIADO_GRANDE' && archivo.error.transitorio)
          return err(archivo.error);
        await deps.documentos.marcarNoDisponible(despachoId, documento.id, deps.reloj.ahora());
        noDisponibles++;
        continue;
      }

      const tipo = detectarTipoDeArchivo(archivo.value.contenido, documento.nombre);
      if (!tipo) {
        deps.logger.warn('Documento con formato no admitido', {
          despachoId,
          documentoId: documento.id,
          tipoDeclarado: archivo.value.tipoDeclarado,
        });
        await deps.documentos.marcarNoDisponible(despachoId, documento.id, deps.reloj.ahora());
        noDisponibles++;
        continue;
      }

      const guardado = await deps.almacen.guardar(despachoId, archivo.value.contenido);
      await deps.documentos.marcarDescargado(despachoId, documento.id, {
        ...guardado,
        tipoMime: tipo.mime,
        ahora: deps.reloj.ahora(),
      });
      descargados++;
    }

    deps.logger.info('Documentos de la actuación procesados', {
      despachoId,
      actuacionId,
      descargados,
      noDisponibles,
    });
    return ok({ descargados, noDisponibles });
  };
}

export type ObtenerDocumentos = ReturnType<typeof crearObtenerDocumentos>;
