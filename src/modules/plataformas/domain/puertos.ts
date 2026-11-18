import type { Result } from '@/shared/domain/result';
import type { ArchivoDescargado, DocumentoExterno, ResultadoConsulta } from './consulta';
import type { ErrorDeLectura, ErrorPlataforma } from './errores';
import type { CodigoPlataforma } from './plataforma';

/** De qué proceso es la consulta (para las plataformas que consultan con una cuenta). */
export interface AlcanceDeConsulta {
  readonly despachoId: string;
  readonly procesoId: string;
}

export interface ContextoConsulta {
  /** Cancela la consulta (p. ej. si el trabajo venció o el worker se detiene). */
  readonly signal?: AbortSignal;
  /** Proceso consultado. Lo usan los adaptadores que necesitan la cuenta de una persona. */
  readonly alcance?: AlcanceDeConsulta;
}

/**
 * Cuenta de una persona (o del despacho) en una plataforma con ingreso, ya descifrada, para una
 * consulta. El secreto solo vive en memoria durante la consulta y solo viaja a la plataforma.
 */
export interface CuentaDePlataforma {
  readonly credencialId: string;
  readonly usuario: string;
  readonly secreto: string;
  /** Sesión guardada de una consulta anterior (cookies), para no ingresar cada vez. */
  readonly sesion: string | null;
  /**
   * La plataforma ya pidió un código de acceso y la persona aún no lo escribe: no se ingresa de
   * nuevo (se le enviaría otro código); la consulta espera su intervención.
   */
  readonly esperandoCodigo: boolean;
  guardarSesion(sesion: string): Promise<void>;
  olvidarSesion(): Promise<void>;
  /** La plataforma pidió un código de acceso: la credencial queda esperando que lo escriban. */
  esperarCodigo(): Promise<void>;
  /** La plataforma no aceptó el usuario o la contraseña. */
  registrarRechazo(): Promise<void>;
}

/** Elige la cuenta con la que se consulta un proceso en una plataforma con ingreso. */
export interface ProveedorDeCuentas {
  /** null si ni las personas del proceso ni el despacho registraron una. */
  cuentaPara(
    alcance: AlcanceDeConsulta,
    plataforma: CodigoPlataforma,
  ): Promise<CuentaDePlataforma | null>;
}

/**
 * Completa un ingreso que quedó esperando el código de acceso (segundo factor). La persona
 * escribe el código que le llegó; LURIS nunca lo obtiene por su cuenta.
 */
export interface CompletadorDeIngreso {
  readonly plataforma: CodigoPlataforma;
  completar(
    credencialId: string,
    codigo: string,
    ctx: ContextoConsulta,
  ): Promise<
    Result<{ readonly sesion: string }, ErrorPlataforma | 'CODIGO_INVALIDO' | 'INGRESO_VENCIDO'>
  >;
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
 * resuelve retos: si la plataforma pide uno, responde REQUIERE_INTERVENCION. Si pide un código
 * de acceso, el ingreso queda esperándolo para `credencialId` (ver CompletadorDeIngreso).
 */
export interface VerificadorDeAcceso {
  readonly plataforma: CodigoPlataforma;
  verificar(
    usuario: string,
    secreto: string,
    ctx: ContextoConsulta,
    credencialId: string,
  ): Promise<Result<{ readonly sesion: string | null }, ErrorPlataforma>>;
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
