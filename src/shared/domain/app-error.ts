import { generarCodigoDeAyuda } from './codigo-de-ayuda';

export interface DatosAppError {
  /** Código interno estable, en MAYÚSCULAS_CON_GUIONES. Nunca se muestra como mensaje. */
  readonly codigo: string;
  /** Mensaje en español claro: qué pasó y qué puede hacer la persona. Sin jerga técnica. */
  readonly mensajeUsuario: string;
  /** Detalle para el log técnico. Nunca llega a la interfaz. */
  readonly detalleTecnico?: string;
  /** Error original que provocó este, para el log técnico. */
  readonly causa?: unknown;
}

/**
 * Raíz de la jerarquía de errores de LURIS.
 *
 * Separa lo que ve el usuario (`mensajeUsuario`) de lo que va al log (`detalleTecnico`,
 * `causa`). Las fronteras (server actions, route handlers) solo exponen `mensajeUsuario`
 * y el `codigoDeAyuda`.
 */
export class AppError extends Error {
  readonly codigo: string;
  readonly mensajeUsuario: string;
  readonly detalleTecnico: string | undefined;
  readonly codigoDeAyuda: string;

  constructor(datos: DatosAppError) {
    super(datos.detalleTecnico ?? datos.codigo, { cause: datos.causa });
    this.name = new.target.name;
    this.codigo = datos.codigo;
    this.mensajeUsuario = datos.mensajeUsuario;
    this.detalleTecnico = datos.detalleTecnico;
    this.codigoDeAyuda = generarCodigoDeAyuda();
  }
}

export type ErroresPorCampo = Readonly<Record<string, readonly string[]>>;

/** Los datos recibidos no son válidos. Los mensajes por campo se muestran junto a cada campo. */
export class ErrorDeValidacion extends AppError {
  readonly erroresPorCampo: ErroresPorCampo;

  constructor(
    erroresPorCampo: ErroresPorCampo,
    mensajeUsuario = 'Revisa los campos marcados y vuelve a intentarlo.',
  ) {
    super({ codigo: 'VALIDACION', mensajeUsuario });
    this.erroresPorCampo = erroresPorCampo;
  }
}

/** El recurso no existe o no pertenece al despacho de la sesión. */
export class ErrorNoEncontrado extends AppError {
  constructor(mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: 'NO_ENCONTRADO', mensajeUsuario, detalleTecnico });
  }
}

/** La persona no tiene permiso para esta acción. Se verifica siempre en el servidor. */
export class ErrorSinPermiso extends AppError {
  constructor(
    mensajeUsuario = 'No tienes permiso para hacer esto. Si crees que es un error, habla con el administrador de tu despacho.',
    detalleTecnico?: string,
  ) {
    super({ codigo: 'SIN_PERMISO', mensajeUsuario, detalleTecnico });
  }
}

/** Fallo no previsto. El mensaje es genérico y el detalle queda en el log. */
export class ErrorInesperado extends AppError {
  constructor(causa: unknown, detalleTecnico?: string) {
    super({
      codigo: 'INESPERADO',
      mensajeUsuario:
        'Algo salió mal de nuestro lado. Intenta de nuevo en unos minutos; si el problema sigue, escríbenos con el código de ayuda.',
      detalleTecnico: detalleTecnico ?? (causa instanceof Error ? causa.message : undefined),
      causa,
    });
  }
}

export function esAppError(valor: unknown): valor is AppError {
  return valor instanceof AppError;
}

/**
 * Normaliza cualquier valor lanzado a un `AppError`, para que nunca llegue a la interfaz
 * un mensaje técnico. Los `AppError` se conservan; lo demás se envuelve en `ErrorInesperado`.
 */
export function aAppError(valor: unknown): AppError {
  return esAppError(valor) ? valor : new ErrorInesperado(valor);
}
