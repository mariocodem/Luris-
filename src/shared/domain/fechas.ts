/**
 * Fechas en formato colombiano (dd/mm/aaaa, zona America/Bogota). §11 de CLAUDE.md.
 *
 * Hay dos clases de fecha y no se mezclan:
 * - Fecha oficial (de la plataforma): un día calendario sin hora. Se guarda como `date` y Prisma
 *   la entrega como medianoche UTC; se formatea con los componentes UTC para no correr el día.
 * - Instante (cuándo pasó algo en LURIS): se formatea en la hora de Bogotá.
 */

const ZONA = 'America/Bogota';

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
