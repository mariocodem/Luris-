import type { DocumentoExterno } from '@/modules/plataformas/domain/consulta';
import type { CodigoPlataforma } from '@/modules/plataformas/domain/plataforma';

/** Puertos de los documentos adjuntos (§8). Implementaciones en infrastructure/. */

export interface ArchivoGuardado {
  /** Ruta relativa dentro del almacén. */
  readonly ruta: string;
  readonly sha256: string;
  readonly tamanoBytes: number;
}

/**
 * Dónde viven los archivos. Hoy en disco (volumen Docker de la app); diseñado para cambiar a un
 * almacenamiento compatible con S3 sin tocar los casos de uso.
 */
export interface AlmacenDeArchivos {
  /** Guarda el contenido (deduplicado por SHA-256 dentro del despacho). */
  guardar(despachoId: string, contenido: Uint8Array): Promise<ArchivoGuardado>;
  /** Abre un archivo guardado para leerlo, o null si ya no existe. */
  abrir(ruta: string): Promise<ReadableStream<Uint8Array> | null>;
}

export interface ActuacionDeOrigen {
  readonly plataforma: CodigoPlataforma;
  readonly idExterno: string | null;
  /** Proceso de la actuación (las plataformas con ingreso eligen la cuenta según el proceso). */
  readonly procesoId: string;
}

export interface DocumentoPendiente {
  readonly id: string;
  readonly idExterno: string;
  readonly nombre: string;
}

export interface DocumentoParaAbrir {
  readonly procesoId: string;
  readonly nombre: string;
  readonly tipoMime: string;
  readonly tamanoBytes: number;
  readonly ruta: string;
}

export interface RepositorioDeDocumentos {
  actuacionDeOrigen(despachoId: string, actuacionId: string): Promise<ActuacionDeOrigen | null>;
  /** Registra las referencias que aún no existan (por id externo). */
  registrarReferencias(
    despachoId: string,
    actuacionId: string,
    referencias: readonly DocumentoExterno[],
  ): Promise<void>;
  /** Documentos de la actuación que aún no se han descargado. */
  pendientes(despachoId: string, actuacionId: string): Promise<readonly DocumentoPendiente[]>;
  marcarDescargado(
    despachoId: string,
    documentoId: string,
    archivo: ArchivoGuardado & { readonly tipoMime: string; readonly ahora: Date },
  ): Promise<void>;
  marcarNoDisponible(despachoId: string, documentoId: string, ahora: Date): Promise<void>;
  /** Un documento descargado, con el proceso al que pertenece (para verificar permisos). */
  paraAbrir(despachoId: string, documentoId: string): Promise<DocumentoParaAbrir | null>;
  /** El proceso al que pertenece una actuación, o null si no existe en el despacho. */
  procesoDeLaActuacion(despachoId: string, actuacionId: string): Promise<string | null>;
  /** Registra un documento que una persona subió a mano (ya guardado en el almacén). */
  registrarSubido(
    despachoId: string,
    datos: ArchivoGuardado & {
      readonly actuacionId: string;
      readonly nombre: string;
      readonly tipoMime: string;
      readonly subidoPorId: string;
      readonly ahora: Date;
    },
  ): Promise<{ readonly id: string }>;
}
