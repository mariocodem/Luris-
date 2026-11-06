import { z } from 'zod';
import {
  DEFINICIONES,
  validarIdentificador,
  type ErrorIdentificadorInvalido,
} from './identificador-judicial';
import type { Marca } from './marca';
import { map, type Result } from './result';

/**
 * Número de radicación de la Rama Judicial: exactamente 23 dígitos.
 * Siempre es texto (nunca número, para conservar los ceros a la izquierda) y nunca lleva
 * guiones ni espacios, ni al guardarse ni al mostrarse.
 */
export type Radicado = Marca<string, 'Radicado'>;

export const LONGITUD_RADICADO = DEFINICIONES.RADICADO.longitud;

const FORMATO_RADICADO = new RegExp(`^\\d{${LONGITUD_RADICADO}}$`);

/** Acepta cualquier texto ("11001-31-03-001-2023-00123-00", con espacios, puntos…). */
export function crearRadicado(texto: string): Result<Radicado, ErrorIdentificadorInvalido> {
  return map(validarIdentificador('RADICADO', texto), (digitos) => digitos as Radicado);
}

/** Comprueba si un valor ya normalizado (p. ej. leído de la base de datos) es un radicado. */
export function esRadicado(valor: string): valor is Radicado {
  return FORMATO_RADICADO.test(valor);
}

/** Esquema reutilizable para formularios, server actions e importaciones. */
export const esquemaRadicado = z
  .string({ error: `Escribe el radicado: son ${LONGITUD_RADICADO} números.` })
  .transform((texto, ctx): Radicado => {
    const resultado = crearRadicado(texto);
    if (resultado.ok) return resultado.value;
    ctx.addIssue({ code: 'custom', message: resultado.error.mensajeUsuario });
    return z.NEVER;
  });
