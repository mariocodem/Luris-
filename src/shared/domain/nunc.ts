import { z } from 'zod';
import {
  DEFINICIONES,
  validarIdentificador,
  type ErrorIdentificadorInvalido,
} from './identificador-judicial';
import type { Marca } from './marca';
import { map, type Result } from './result';

/**
 * Número Único de Noticia Criminal (SPOA, Fiscalía): exactamente 21 dígitos.
 * Siempre es texto y nunca lleva guiones ni espacios.
 */
export type Nunc = Marca<string, 'Nunc'>;

export const LONGITUD_NUNC = DEFINICIONES.NUNC.longitud;

const FORMATO_NUNC = new RegExp(`^\\d{${LONGITUD_NUNC}}$`);

/** Acepta cualquier texto ("11001-60-00049-2023-00123", con espacios, puntos…). */
export function crearNunc(texto: string): Result<Nunc, ErrorIdentificadorInvalido> {
  return map(validarIdentificador('NUNC', texto), (digitos) => digitos as Nunc);
}

/** Comprueba si un valor ya normalizado (p. ej. leído de la base de datos) es un NUNC. */
export function esNunc(valor: string): valor is Nunc {
  return FORMATO_NUNC.test(valor);
}

/** Esquema reutilizable para formularios, server actions e importaciones. */
export const esquemaNunc = z
  .string({ error: `Escribe el NUNC: son ${LONGITUD_NUNC} números.` })
  .transform((texto, ctx): Nunc => {
    const resultado = crearNunc(texto);
    if (resultado.ok) return resultado.value;
    ctx.addIssue({ code: 'custom', message: resultado.error.mensajeUsuario });
    return z.NEVER;
  });
