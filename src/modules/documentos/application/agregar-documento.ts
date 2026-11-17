import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import { cargarProcesoAutorizado } from '@/modules/procesos/application/acceso-a-proceso';
import type { RepositorioDeProcesos } from '@/modules/procesos/application/puertos';
import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import { AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { detectarTipoDeArchivo, nombreDeDescarga } from '../domain/tipo-de-archivo';
import type { AlmacenDeArchivos, RepositorioDeDocumentos } from './puertos';

/** El archivo subido no se puede guardar (vacío, muy grande o de un formato no admitido). */
export class ErrorDocumentoInvalido extends AppError {
  constructor(mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: 'DOCUMENTO_INVALIDO', mensajeUsuario, detalleTecnico });
  }
}

/**
 * Agrega a mano un documento a una actuación (Fase 7). Es la vía asistida para los documentos que
 * una plataforma solo entrega tras un reto (p. ej. SAMAI): la persona lo descarga allí y lo sube
 * aquí. Se valida igual que lo que descarga LURIS: tipo real, tamaño, y se guarda deduplicado.
 * Exige poder editar el proceso.
 */
export function crearAgregarDocumento(deps: {
  readonly procesos: RepositorioDeProcesos;
  readonly documentos: RepositorioDeDocumentos;
  readonly almacen: AlmacenDeArchivos;
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: { ahora(): Date };
  readonly tamanoMaximoBytes: number;
}) {
  return async function agregarDocumento(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly procesoId: string;
      readonly actuacionId: string;
      readonly nombre: string;
      readonly contenido: Uint8Array;
      readonly ip: string | null;
    },
  ): Promise<Result<{ readonly id: string; readonly nombre: string }, AppError>> {
    const cargado = await cargarProcesoAutorizado(
      deps.procesos,
      contexto,
      solicitud.procesoId,
      'editar',
    );
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;

    const procesoDeLaActuacion = await deps.documentos.procesoDeLaActuacion(
      actor.despacho.id,
      solicitud.actuacionId,
    );
    if (procesoDeLaActuacion !== proceso.id) {
      return err(
        new ErrorNoEncontrado(
          'No encontramos esa actuación en el proceso. Recarga la página.',
          `Actuación ${solicitud.actuacionId}`,
        ),
      );
    }

    const megas = Math.round(deps.tamanoMaximoBytes / (1024 * 1024));
    if (solicitud.contenido.byteLength === 0) {
      return err(new ErrorDocumentoInvalido('El archivo está vacío. Elige el documento de nuevo.'));
    }
    if (solicitud.contenido.byteLength > deps.tamanoMaximoBytes) {
      return err(
        new ErrorDocumentoInvalido(`El archivo pesa más de ${megas} MB, el máximo permitido.`),
      );
    }
    const tipo = detectarTipoDeArchivo(solicitud.contenido, solicitud.nombre);
    if (!tipo) {
      return err(
        new ErrorDocumentoInvalido(
          'Ese archivo no es un PDF, una imagen (PNG, JPG, TIFF), un Word, un Excel ni un RTF. Súbelo en uno de esos formatos.',
        ),
      );
    }

    const guardado = await deps.almacen.guardar(actor.despacho.id, solicitud.contenido);
    const nombre = nombreDeDescarga(solicitud.nombre, tipo);
    const { id } = await deps.documentos.registrarSubido(actor.despacho.id, {
      ...guardado,
      actuacionId: solicitud.actuacionId,
      nombre,
      tipoMime: tipo.mime,
      subidoPorId: actor.membresiaId,
      ahora: deps.reloj.ahora(),
    });
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'DOCUMENTO_AGREGADO',
      entidad: 'Documento',
      entidadId: id,
      datos: {
        procesoId: proceso.id,
        actuacionId: solicitud.actuacionId,
        tamanoBytes: guardado.tamanoBytes,
      },
      ip: solicitud.ip,
    });
    return ok({ id, nombre });
  };
}
