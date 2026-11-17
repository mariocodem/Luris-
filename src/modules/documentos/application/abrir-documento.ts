import { cargarProcesoAutorizado } from '@/modules/procesos/application/acceso-a-proceso';
import type { RepositorioDeProcesos } from '@/modules/procesos/application/puertos';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { type AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { nombreDeDescarga, tipoPorMime, type TipoDeArchivo } from '../domain/tipo-de-archivo';
import type { AlmacenDeArchivos, RepositorioDeDocumentos } from './puertos';

export interface DocumentoAbierto {
  readonly procesoId: string;
  /** Nombre para descargarlo, con la extensión de su tipo real. */
  readonly nombre: string;
  readonly tipo: TipoDeArchivo;
  readonly tamanoBytes: number;
  /** Abre el contenido para enviarlo; null si el archivo ya no está en el almacén. */
  leer(): Promise<ReadableStream<Uint8Array> | null>;
}

const NO_ENCONTRADO =
  'No encontramos ese documento. Puede que ya no esté disponible; vuelve a la ficha del proceso.';

/**
 * Abre un documento descargado para verlo o descargarlo (§8). Se sirve solo por una ruta
 * autenticada: verifica el despacho de la sesión y que la persona pueda ver el proceso.
 * Si no puede, responde «no encontrado» (no revela que existe).
 */
export function crearAbrirDocumento(deps: {
  readonly procesos: RepositorioDeProcesos;
  readonly documentos: RepositorioDeDocumentos;
  readonly almacen: AlmacenDeArchivos;
}) {
  return async function abrirDocumento(
    contexto: ContextoDeSesion,
    documentoId: string,
  ): Promise<Result<DocumentoAbierto, AppError>> {
    const miembro = exigirMiembroConPermiso(contexto, 'PROCESOS_CONSULTAR');
    if (!miembro.ok) return miembro;

    const documento = await deps.documentos.paraAbrir(miembro.value.despacho.id, documentoId);
    if (!documento) return err(new ErrorNoEncontrado(NO_ENCONTRADO, `Documento ${documentoId}`));

    const acceso = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      documento.procesoId,
      'ver',
    );
    if (!acceso.ok)
      return err(new ErrorNoEncontrado(NO_ENCONTRADO, `Documento ${documentoId} sin acceso`));

    const tipo = tipoPorMime(documento.tipoMime);
    if (!tipo)
      return err(new ErrorNoEncontrado(NO_ENCONTRADO, `Tipo sin admitir: ${documento.tipoMime}`));
    return ok({
      procesoId: documento.procesoId,
      nombre: nombreDeDescarga(documento.nombre, tipo),
      tipo,
      tamanoBytes: documento.tamanoBytes,
      leer: () => deps.almacen.abrir(documento.ruta),
    });
  };
}
