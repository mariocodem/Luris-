import type { FechaOficial } from '@/shared/domain/fechas';
import type { CodigoPlataforma } from './plataforma';
import type { SistemaDeOrigen } from './tyba';

/**
 * Lo que una plataforma informa de un proceso, ya normalizado por su adaptador. Es el mismo
 * contrato para todas las plataformas (§6): los casos de uso no saben de dónde vino.
 */

export interface SujetoProcesal {
  /** Como lo nombra la plataforma: «Demandante», «Demandado/indiciado/causante»… */
  readonly tipo: string;
  readonly nombre: string;
}

/**
 * Un expediente del proceso en la plataforma. Un mismo radicado puede tener varios: en la CPNU,
 * uno por cada sistema o despacho judicial donde está registrado (p. ej. el sistema anterior y
 * Tyba). Sus actuaciones se unen en una sola línea de tiempo.
 */
export interface ExpedienteExterno {
  readonly idExterno: string;
  readonly despachoJudicial: string | null;
  readonly departamento: string | null;
  readonly ponente: string | null;
  readonly tipoProceso: string | null;
  readonly claseProceso: string | null;
  readonly subclaseProceso: string | null;
  readonly recurso: string | null;
  /** Dónde está el expediente según la plataforma («Archivo», «Software: Justicia XXI Web»…). */
  readonly ubicacion: string | null;
  readonly fechaRadicacion: FechaOficial | null;
  readonly ultimaActuacion: FechaOficial | null;
  readonly sujetos: readonly SujetoProcesal[];
  /** Proceso reservado: la plataforma no publica sus actuaciones. */
  readonly reservado: boolean;
  /**
   * Otros datos propios de la plataforma, ya en texto para mostrar (p. ej. en el SPOA: estado,
   * etapa, delitos, unidad). Vacío si la plataforma no tiene más.
   */
  readonly detalles: readonly DetalleDeExpediente[];
  /** Página del expediente en el portal de la plataforma, si tiene una propia. */
  readonly urlDeConsulta: string | null;
  /** Sistema donde vive el expediente cuando la plataforma agrupa varios (p. ej. Tyba en la CPNU). */
  readonly sistema?: SistemaDeOrigen;
}

export interface DetalleDeExpediente {
  readonly etiqueta: string;
  readonly valor: string;
}

export interface ActuacionExterna {
  /** Identificador de la actuación en la plataforma, si lo da. */
  readonly idExterno: string | null;
  /** Expediente al que pertenece (idExterno del expediente). */
  readonly expediente: string;
  readonly despachoJudicial: string | null;
  /** Fecha oficial de la actuación. */
  readonly fechaActuacion: FechaOficial;
  /** Fecha oficial en que la plataforma la registró, si la informa. */
  readonly fechaRegistro: FechaOficial | null;
  readonly descripcion: string;
  readonly anotacion: string | null;
  readonly terminoInicia: FechaOficial | null;
  readonly terminoVence: FechaOficial | null;
  readonly tieneDocumentos: boolean;
  /** Sistema de origen de la actuación cuando llega por otra plataforma (p. ej. Tyba por la CPNU). */
  readonly origen?: SistemaDeOrigen;
}

export interface ResultadoConsulta {
  readonly plataforma: CodigoPlataforma;
  /** Al menos uno. */
  readonly expedientes: readonly ExpedienteExterno[];
  readonly actuaciones: readonly ActuacionExterna[];
  /**
   * La plataforma solo aporta datos del proceso: sus actuaciones llegan por otra (p. ej. las de
   * SAMAI llegan por la CPNU, que las toma de SAMAI). Así no se duplican en la línea de tiempo.
   */
  readonly soloDatos?: boolean;
}

/** Referencia a un documento adjunto a una actuación, antes de descargarlo. */
export interface DocumentoExterno {
  readonly idExterno: string;
  readonly nombre: string;
  readonly fechaCarga: FechaOficial | null;
  /** Dirección del documento en la plataforma (para auditoría y para reintentar). */
  readonly urlOrigen: string;
}

export interface ArchivoDescargado {
  readonly contenido: Uint8Array;
  /** Tipo que declaró la plataforma. Orientativo: el tipo real se valida por el contenido. */
  readonly tipoDeclarado: string | null;
}
