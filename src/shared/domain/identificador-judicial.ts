import { AppError } from './app-error';
import { err, ok, type Result } from './result';

export type TipoIdentificador = 'RADICADO' | 'NUNC';

interface DefinicionIdentificador {
  /** Cómo se nombra ante el usuario. */
  readonly nombre: string;
  readonly longitud: number;
  /** Pista cuando la longitud coincide con la del otro identificador. */
  readonly pistaOtroTipo: { readonly longitud: number; readonly mensaje: string };
}

export const DEFINICIONES: Readonly<Record<TipoIdentificador, DefinicionIdentificador>> = {
  RADICADO: {
    nombre: 'radicado',
    longitud: 23,
    pistaOtroTipo: {
      longitud: 21,
      mensaje: 'Si es un NUNC de la Fiscalía (21 números), regístralo en el campo NUNC.',
    },
  },
  NUNC: {
    nombre: 'NUNC',
    longitud: 21,
    pistaOtroTipo: {
      longitud: 23,
      mensaje:
        'Si es un radicado de la Rama Judicial (23 números), regístralo en el campo radicado.',
    },
  },
};

export type MotivoIdentificadorInvalido = 'VACIO' | 'LONGITUD_INCORRECTA';

/** El texto recibido no corresponde a un radicado o NUNC válido. */
export class ErrorIdentificadorInvalido extends AppError {
  readonly tipo: TipoIdentificador;
  readonly motivo: MotivoIdentificadorInvalido;
  readonly digitosEncontrados: number;

  constructor(tipo: TipoIdentificador, digitosEncontrados: number) {
    const motivo: MotivoIdentificadorInvalido =
      digitosEncontrados === 0 ? 'VACIO' : 'LONGITUD_INCORRECTA';
    super({
      codigo: `${tipo}_INVALIDO`,
      mensajeUsuario: redactarMensaje(tipo, digitosEncontrados),
    });
    this.tipo = tipo;
    this.motivo = motivo;
    this.digitosEncontrados = digitosEncontrados;
  }
}

function redactarMensaje(tipo: TipoIdentificador, digitos: number): string {
  const { nombre, longitud, pistaOtroTipo } = DEFINICIONES[tipo];
  if (digitos === 0) return `Escribe el ${nombre}: son ${longitud} números.`;
  const base = `El ${nombre} debe tener ${longitud} números; este tiene ${digitos}.`;
  return digitos === pistaOtroTipo.longitud ? `${base} ${pistaOtroTipo.mensaje}` : base;
}

/**
 * Deja solo los dígitos del texto. Antes normaliza con NFKC para convertir dígitos de
 * ancho completo (frecuentes al copiar desde PDF o Word) en dígitos ASCII.
 */
export function normalizarADigitos(texto: string): string {
  return texto.normalize('NFKC').replace(/\D/g, '');
}

/** Normaliza y valida la longitud. Devuelve la cadena de dígitos, sin guiones ni espacios. */
export function validarIdentificador(
  tipo: TipoIdentificador,
  texto: string,
): Result<string, ErrorIdentificadorInvalido> {
  const digitos = normalizarADigitos(texto);
  return digitos.length === DEFINICIONES[tipo].longitud
    ? ok(digitos)
    : err(new ErrorIdentificadorInvalido(tipo, digitos.length));
}
