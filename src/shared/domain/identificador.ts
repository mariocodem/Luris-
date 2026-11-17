import { AppError } from './app-error';
import { normalizarADigitos } from './identificador-judicial';
import { crearNunc, LONGITUD_NUNC, type Nunc } from './nunc';
import { crearRadicado, LONGITUD_RADICADO, type Radicado } from './radicado';
import { err, ok, type Result } from './result';

/** Radicado (Rama Judicial) o NUNC (SPOA), ya normalizado a dígitos. */
export type Identificador =
  | { readonly tipo: 'RADICADO'; readonly valor: Radicado }
  | { readonly tipo: 'NUNC'; readonly valor: Nunc };

export type MotivoNoReconocido = 'VACIO' | 'NOTACION_CIENTIFICA' | 'LONGITUD_INCORRECTA';

/** El texto no es un radicado ni un NUNC. */
export class ErrorIdentificadorNoReconocido extends AppError {
  readonly motivo: MotivoNoReconocido;
  readonly digitosEncontrados: number;

  constructor(motivo: MotivoNoReconocido, digitosEncontrados: number) {
    super({
      codigo: 'IDENTIFICADOR_NO_RECONOCIDO',
      mensajeUsuario: redactar(motivo, digitosEncontrados),
    });
    this.motivo = motivo;
    this.digitosEncontrados = digitosEncontrados;
  }
}

function redactar(motivo: MotivoNoReconocido, digitos: number): string {
  switch (motivo) {
    case 'VACIO':
      return `Escribe un radicado (${LONGITUD_RADICADO} números) o un NUNC (${LONGITUD_NUNC} números).`;
    case 'NOTACION_CIENTIFICA':
      return 'Este número quedó en notación científica: Excel lo guardó como número y perdió dígitos. Formatea la columna como Texto y vuelve a escribirlo.';
    case 'LONGITUD_INCORRECTA':
      return `Debe tener ${LONGITUD_RADICADO} números (radicado) o ${LONGITUD_NUNC} (NUNC); este tiene ${digitos}.`;
  }
}

/** "1.1001310300120231E+22": así queda un radicado que Excel guardó como número. */
const NOTACION_CIENTIFICA = /^\s*\d+(?:[.,]\d+)?\s*e\s*\+?\s*\d+\s*$/i;

/**
 * Reconoce un radicado o un NUNC por su cantidad de dígitos (23 o 21), aceptando guiones,
 * espacios y puntos. Para importaciones y consultas masivas, donde una sola columna puede traer
 * los dos tipos.
 */
export function reconocerIdentificador(
  texto: string,
): Result<Identificador, ErrorIdentificadorNoReconocido> {
  if (NOTACION_CIENTIFICA.test(texto)) {
    return err(new ErrorIdentificadorNoReconocido('NOTACION_CIENTIFICA', 0));
  }
  const digitos = normalizarADigitos(texto);
  if (digitos.length === LONGITUD_RADICADO) {
    const radicado = crearRadicado(digitos);
    if (radicado.ok) return ok({ tipo: 'RADICADO', valor: radicado.value });
  }
  if (digitos.length === LONGITUD_NUNC) {
    const nunc = crearNunc(digitos);
    if (nunc.ok) return ok({ tipo: 'NUNC', valor: nunc.value });
  }
  return err(
    new ErrorIdentificadorNoReconocido(
      digitos.length === 0 ? 'VACIO' : 'LONGITUD_INCORRECTA',
      digitos.length,
    ),
  );
}

/** Indica si el texto parece un número que Excel pasó a notación científica. */
export function esNotacionCientifica(texto: string): boolean {
  return NOTACION_CIENTIFICA.test(texto);
}
