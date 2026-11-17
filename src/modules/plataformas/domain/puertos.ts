import type { Result } from '@/shared/domain/result';
import type { ArchivoDescargado, DocumentoExterno, ResultadoConsulta } from './consulta';
import type { ErrorDeLectura, ErrorPlataforma } from './errores';
import type { CodigoPlataforma } from './plataforma';

export interface ContextoConsulta {
  /** Cancela la consulta (p. ej. si el trabajo venció o el worker se detiene). */
  readonly signal?: AbortSignal;
}

/**
 * Puerto de consulta de una plataforma judicial (§6). Cada plataforma tiene un adaptador que lo
 * implementa con el mismo contrato de entrada, salida y errores, así que cualquiera puede
 * sustituir a otro sin tocar los casos de uso.
 */
export interface PlataformaJudicial {
  readonly codigo: CodigoPlataforma;
  readonly identificador: 'RADICADO' | 'NUNC';
  /**
   * Consulta el proceso por su identificador ya normalizado (solo dígitos).
   * Nunca lanza por un fallo esperable: lo devuelve como `ErrorPlataforma`.
   */
  consultar(id: string, ctx: ContextoConsulta): Promise<Result<ResultadoConsulta, ErrorPlataforma>>;
}

/**
 * Consulta asistida (§6): para las plataformas con reto (CAPTCHA), la persona hace la consulta en
 * el portal oficial y resuelve el reto ella misma; LURIS solo lee el resultado que ella pega.
 * LURIS nunca resuelve, evade ni terceriza el reto.
 */
export interface LectorDeConsultaAsistida {
  readonly plataforma: CodigoPlataforma;
  readonly identificador: 'RADICADO' | 'NUNC';
  /** Portal oficial donde la persona hace la consulta. */
  readonly urlDelPortal: string;
  /** Lee el texto copiado del resultado y verifica que sea del identificador `id`. */
  interpretar(texto: string, id: string): Result<ResultadoConsulta, ErrorDeLectura>;
}

/**
 * Prueba que un usuario y contraseña entran a la plataforma (al guardar una credencial). Nunca
 * resuelve retos: si la plataforma pide uno, responde REQUIERE_INTERVENCION.
 */
export interface VerificadorDeAcceso {
  readonly plataforma: CodigoPlataforma;
  verificar(
    usuario: string,
    secreto: string,
    ctx: ContextoConsulta,
  ): Promise<Result<void, ErrorPlataforma>>;
}

/**
 * Documentos adjuntos a las actuaciones. Puerto aparte (I de SOLID): una plataforma que no da
 * documentos simplemente no lo implementa.
 */
export interface DescargadorDeDocumentos {
  readonly plataforma: CodigoPlataforma;
  /** Documentos de una actuación, por el identificador externo de la actuación. */
  listar(
    idExternoActuacion: string,
    ctx: ContextoConsulta,
  ): Promise<Result<readonly DocumentoExterno[], ErrorPlataforma>>;
  /**
   * Descarga un documento sin pasar de `tamanoMaximo` bytes. NO_ENCONTRADO = la plataforma no lo
   * tiene disponible ahora.
   */
  descargar(
    idExternoDocumento: string,
    tamanoMaximo: number,
    ctx: ContextoConsulta,
  ): Promise<Result<ArchivoDescargado, ErrorPlataforma | 'DEMASIADO_GRANDE'>>;
}
