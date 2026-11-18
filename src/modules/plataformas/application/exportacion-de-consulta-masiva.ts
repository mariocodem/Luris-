import { formatearDiaYHora } from '@/shared/domain/fechas';
import { ETIQUETA_DE_ESTADO_DE_ITEM, MENSAJE_DE_ITEM_ASISTIDO } from '../domain/consulta-masiva';
import { NOMBRES_DE_PLATAFORMA } from '../domain/plataforma';
import type { ItemDeConsultaMasiva } from './puertos';

/** Encabezados de la exportación de resultados (Excel o CSV), en el orden de las columnas. */
export const ENCABEZADOS_DE_EXPORTACION = [
  'Radicado o NUNC',
  'Tipo',
  'Alias',
  'Cliente',
  'Plataforma',
  'Estado',
  'Resultado',
  'Actuaciones nuevas',
  'Última actualización',
] as const;

/**
 * Una fila por radicado y plataforma. Todo es texto, para que Excel no convierta los radicados
 * de 23 números en notación científica ni les quite los ceros a la izquierda.
 */
export function filasDeExportacion(items: readonly ItemDeConsultaMasiva[]): string[][] {
  return items.map((item) => [
    item.identificador,
    item.tipo === 'NUNC' ? 'NUNC' : 'Radicado',
    item.alias ?? '',
    item.cliente ?? '',
    NOMBRES_DE_PLATAFORMA[item.plataforma],
    ETIQUETA_DE_ESTADO_DE_ITEM[item.estado],
    item.estado === 'PENDIENTE_CONFIRMACION'
      ? MENSAJE_DE_ITEM_ASISTIDO
      : (item.resumen?.mensaje ?? ''),
    item.resumen?.nuevas != null ? String(item.resumen.nuevas) : '',
    formatearDiaYHora(item.actualizadoEn),
  ]);
}

/** Excel interpreta como fórmula lo que empieza con estos caracteres (inyección de fórmulas). */
const INICIOS_DE_FORMULA = /^[=+\-@\t\r]/;

function celdaCsv(valor: string): string {
  const seguro = INICIOS_DE_FORMULA.test(valor) ? `'${valor}` : valor;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

/**
 * CSV para Excel en español: separador «;», BOM para las tildes y saltos de línea CRLF. Los
 * valores que Excel tomaría por fórmulas llevan un apóstrofo delante.
 */
export function aCsv(filas: readonly (readonly string[])[]): string {
  const lineas = [ENCABEZADOS_DE_EXPORTACION, ...filas].map((fila) => fila.map(celdaCsv).join(';'));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

/** «consulta-masiva-luris-2026-11-18.xlsx», con el día en hora de Bogotá. */
export function nombreDeArchivoDeExportacion(creadoEn: Date, extension: 'csv' | 'xlsx'): string {
  const dia = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(creadoEn);
  return `consulta-masiva-luris-${dia}.${extension}`;
}
