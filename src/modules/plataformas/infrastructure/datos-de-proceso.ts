import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { leerFechaOficial } from '@/shared/domain/fechas';
import type { ExpedienteExterno, ResultadoConsulta } from '../domain/consulta';

/**
 * Datos del proceso según la plataforma, guardados como JSON en `procesos_plataforma.datos_proceso`
 * (despacho judicial, partes, clase…). Se validan al leerlos: un JSON viejo o dañado no rompe la
 * ficha, simplemente no se muestra.
 */

const VERSION = 1;

export function aDatosGuardados(resultado: ResultadoConsulta): Prisma.InputJsonObject {
  return {
    version: VERSION,
    expedientes: resultado.expedientes.map((expediente) => ({
      ...expediente,
      sujetos: expediente.sujetos.map((sujeto) => ({ ...sujeto })),
      detalles: expediente.detalles.map((detalle) => ({ ...detalle })),
    })),
  };
}

const fecha = z
  .string()
  .nullable()
  .transform((texto) => (texto ? leerFechaOficial(texto) : null));
const texto = z.string().nullable();

const esquemaDatosGuardados = z.object({
  version: z.literal(VERSION),
  expedientes: z.array(
    z.object({
      idExterno: z.string(),
      despachoJudicial: texto,
      departamento: texto,
      ponente: texto,
      tipoProceso: texto,
      claseProceso: texto,
      subclaseProceso: texto,
      recurso: texto,
      ubicacion: texto,
      fechaRadicacion: fecha,
      ultimaActuacion: fecha,
      sujetos: z.array(z.object({ tipo: z.string(), nombre: z.string() })),
      reservado: z.boolean(),
      detalles: z.array(z.object({ etiqueta: z.string(), valor: z.string() })).default([]),
      urlDeConsulta: z.string().nullable().default(null),
    }),
  ),
});

export function leerDatosGuardados(json: unknown): readonly ExpedienteExterno[] {
  if (json === null || json === undefined) return [];
  const datos = esquemaDatosGuardados.safeParse(json);
  return datos.success ? datos.data.expedientes : [];
}
