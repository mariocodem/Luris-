import { z } from 'zod';
import { leerFechaOficial } from '@/shared/domain/fechas';

/**
 * Respuestas de la búsqueda pública de SAMAI (`POST /Vistas/Casos/Jprocesos.ashx/buscar`).
 * Documentadas en docs/plataformas/samai.md. Solo se exigen los campos que LURIS usa.
 */

const texto = z.string().nullish();

export const esquemaItemSamai = z.object({
  radicado: z.string(),
  corporacion: z.string(),
  guid: z.string(),
  ponente: texto,
  nombreDespachoOperativo: texto,
  identidadDespacho: z
    .object({
      officeName: texto,
      currentHolder: texto,
      holderStatus: texto,
      historicalReportingJudge: texto,
    })
    .nullish(),
  clase: texto,
  fechaIngreso: z
    .string()
    .nullish()
    .transform((t) => (t ? leerFechaOficial(t) : null)),
  vigente: texto,
  interno: texto,
  asunto: texto,
  demandante: texto,
  demandado: texto,
  esPrivado: z.boolean().nullish(),
  urlDetalle: texto,
});
export type ItemSamai = z.infer<typeof esquemaItemSamai>;

export const esquemaBusquedaSamai = z.object({
  ok: z.literal(true),
  data: z.object({
    items: z.array(esquemaItemSamai),
    total: z.number().int().nonnegative(),
  }),
});

export const esquemaErrorSamai = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
});
