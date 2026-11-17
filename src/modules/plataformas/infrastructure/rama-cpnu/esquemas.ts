import { z } from 'zod';
import { type FechaOficial, leerFechaOficial } from '@/shared/domain/fechas';

/**
 * Esquemas de las respuestas de la API de la Consulta de Procesos Nacional Unificada (CPNU).
 * Documentados en docs/plataformas/rama-cpnu.md. Si la Rama Judicial cambia el formato, la
 * validación falla y la consulta termina en RESPUESTA_INESPERADA (§6), con el detalle en el log.
 *
 * Solo se exigen los campos que LURIS usa; los demás se ignoran.
 */

const fechaOficial = z.string().transform((texto, contexto): FechaOficial => {
  const fecha = leerFechaOficial(texto);
  if (fecha) return fecha;
  contexto.addIssue({ code: 'custom', message: `fecha inválida: ${texto}` });
  return z.NEVER;
});

const fechaOpcional = z
  .string()
  .nullish()
  .transform((texto) => (texto ? leerFechaOficial(texto) : null));

const texto = z.string().nullish();
const id = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String);

const paginacion = z.object({
  cantidadRegistros: z.number().int().nonnegative(),
  cantidadPaginas: z.number().int().nonnegative(),
  pagina: z.number().int(),
});

/** GET /Procesos/Consulta/NumeroRadicacion */
export const esquemaBusqueda = z.object({
  procesos: z.array(
    z.object({
      idProceso: id,
      llaveProceso: z.string(),
      fechaProceso: fechaOpcional,
      fechaUltimaActuacion: fechaOpcional,
      despacho: texto,
      departamento: texto,
      sujetosProcesales: texto,
      esPrivado: z.boolean().nullish(),
    }),
  ),
  paginacion,
});
export type BusquedaCpnu = z.infer<typeof esquemaBusqueda>;

/** GET /Proceso/Detalle/{idProceso} */
export const esquemaDetalle = z.object({
  llaveProceso: z.string(),
  esPrivado: z.boolean().nullish(),
  fechaProceso: fechaOpcional,
  despacho: texto,
  ponente: texto,
  tipoProceso: texto,
  claseProceso: texto,
  subclaseProceso: texto,
  recurso: texto,
  ubicacion: texto,
});
export type DetalleCpnu = z.infer<typeof esquemaDetalle>;

/** GET /Proceso/Actuaciones/{idProceso}?pagina={n} */
export const esquemaActuaciones = z.object({
  actuaciones: z.array(
    z.object({
      idRegActuacion: id,
      llaveProceso: z.string().nullish(),
      fechaActuacion: fechaOficial,
      actuacion: texto,
      anotacion: texto,
      fechaInicial: fechaOpcional,
      fechaFinal: fechaOpcional,
      fechaRegistro: fechaOpcional,
      conDocumentos: z.boolean().nullish(),
    }),
  ),
  paginacion,
});
export type ActuacionesCpnu = z.infer<typeof esquemaActuaciones>;

/** GET /Proceso/DocumentosActuacion/{idRegActuacion}: lista sin envoltura. */
export const esquemaDocumentos = z.array(
  z.object({
    idRegDocumento: id,
    nombre: texto,
    descripcion: texto,
    fechaCarga: fechaOpcional,
  }),
);

/** Cuerpo de error de la API: {"StatusCode": 404, "Message": "..."}. */
export const esquemaError = z.object({
  StatusCode: z.number().int().optional(),
  Message: z.string().optional(),
});
