import { z } from 'zod';
import { crearNunc, type Nunc } from '@/shared/domain/nunc';
import { crearRadicado, type Radicado } from '@/shared/domain/radicado';
import {
  LIMITES_DE_PROCESO,
  problemasDeEtiquetas,
  unificarEtiquetas,
  type DatosDeProceso,
} from './proceso';

/** Esquemas de procesos para formularios y server actions. Mensajes en español claro (§10). */

/** Radicado opcional: vacío → null; cualquier otro texto se normaliza y valida (23 dígitos). */
export const esquemaRadicadoOpcional = z
  .string()
  .default('')
  .transform((texto, ctx): Radicado | null => {
    if (texto.trim() === '') return null;
    const resultado = crearRadicado(texto);
    if (resultado.ok) return resultado.value;
    ctx.addIssue({ code: 'custom', message: resultado.error.mensajeUsuario });
    return z.NEVER;
  });

/** NUNC opcional: vacío → null; cualquier otro texto se normaliza y valida (21 dígitos). */
export const esquemaNuncOpcional = z
  .string()
  .default('')
  .transform((texto, ctx): Nunc | null => {
    if (texto.trim() === '') return null;
    const resultado = crearNunc(texto);
    if (resultado.ok) return resultado.value;
    ctx.addIssue({ code: 'custom', message: resultado.error.mensajeUsuario });
    return z.NEVER;
  });

function textoOpcional(maximo: number, campo: string) {
  return z
    .string()
    .default('')
    .transform((texto) => texto.trim().replace(/\s+/g, ' '))
    .pipe(z.string().max(maximo, `${campo} puede tener máximo ${maximo} caracteres.`))
    .transform((texto) => (texto === '' ? null : texto));
}

export const esquemaEtiquetas = z
  .array(z.string())
  .default([])
  .transform((nombres, ctx) => {
    const etiquetas = unificarEtiquetas(nombres);
    for (const problema of problemasDeEtiquetas(etiquetas)) {
      ctx.addIssue({ code: 'custom', message: problema });
    }
    return etiquetas;
  });

/** Datos de un proceso: radicado y/o NUNC (al menos uno), alias, cliente y etiquetas. */
export const esquemaDatosDeProceso = z
  .object({
    radicado: esquemaRadicadoOpcional,
    nunc: esquemaNuncOpcional,
    alias: textoOpcional(LIMITES_DE_PROCESO.alias, 'El alias'),
    cliente: textoOpcional(LIMITES_DE_PROCESO.cliente, 'El cliente'),
    etiquetas: esquemaEtiquetas,
  })
  .refine((datos) => datos.radicado !== null || datos.nunc !== null, {
    path: ['radicado'],
    message: 'Escribe el radicado (23 números) o el NUNC (21 números) del proceso.',
  }) satisfies z.ZodType<DatosDeProceso, unknown>;
