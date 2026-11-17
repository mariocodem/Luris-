/**
 * Fechas en formato colombiano (dd/mm/aaaa, zona America/Bogota). §11 de CLAUDE.md.
 *
 * Hay dos clases de fecha y no se mezclan:
 * - Fecha oficial (de la plataforma): un día calendario sin hora. Se guarda como `date` y Prisma
 *   la entrega como medianoche UTC; se formatea con los componentes UTC para no correr el día.
 * - Instante (cuándo pasó algo en LURIS): se formatea en la hora de Bogotá.
 */

import type { Marca } from './marca';

const ZONA = 'America/Bogota';

/**
 * Día calendario oficial informado por una plataforma, como texto 'AAAA-MM-DD'. Solo se obtiene
 * con `leerFechaOficial`, que valida que el día exista.
 */
export type FechaOficial = Marca<string, 'FechaOficial'>;

/**
 * Lee el día de una fecha de plataforma. Acepta 'AAAA-MM-DD' seguido o no de una hora
 * ('2023-01-31T00:00:00'): la hora se descarta, porque las plataformas informan días de Bogotá
 * y convertirlos de zona correría el día. Devuelve null si no es un día válido.
 */
export function leerFechaOficial(texto: string): FechaOficial | null {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+)?$/.exec(texto.trim());
  if (!coincidencia) return null;
  const [, anio, mes, dia] = coincidencia.map(Number) as [number, number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const existe =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
  if (!existe || anio < 1900) return null;
  return texto.trim().slice(0, 10) as FechaOficial;
}

/** Fecha oficial como Date a medianoche UTC, que es como se guarda en una columna `date`. */
export function fechaOficialComoDate(fecha: FechaOficial): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** Acepta 'AAAA-MM-DD' o un Date de una columna `date`. Devuelve 'dd/mm/aaaa'. */
export function formatearFechaOficial(fecha: Date | string): string {
  if (typeof fecha === 'string') {
    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
    if (!coincidencia) throw new Error(`Fecha oficial con formato inválido: ${fecha}`);
    const [, anio, mes, dia] = coincidencia;
    return `${dia}/${mes}/${anio}`;
  }
  return `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
}

const formatoDia = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatoDiaYHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Día de un instante en Bogotá: 'dd/mm/aaaa'. */
export function formatearDia(instante: Date): string {
  return formatoDia.format(instante);
}

/** Día y hora de un instante en Bogotá: 'dd/mm/aaaa, h:mm a. m.'. */
export function formatearDiaYHora(instante: Date): string {
  return formatoDiaYHora.format(instante);
}

/** Valor ISO 'AAAA-MM-DD' de una fecha oficial, para el atributo `datetime` de <time>. */
export function isoDeFechaOficial(fecha: Date | string): string {
  if (typeof fecha === 'string') return fecha.slice(0, 10);
  return fecha.toISOString().slice(0, 10);
}
