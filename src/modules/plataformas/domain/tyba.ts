import { type CodigoPlataforma, NOMBRES_DE_PLATAFORMA } from './plataforma';

/**
 * Tyba (§6.5) es la «Red integrada para la gestión de procesos judiciales en línea» de la Rama
 * Judicial; su aplicación es Justicia XXI Web (portal procesojudicial.ramajudicial.gov.co). Sus
 * procesos aparecen en la CPNU con sus actuaciones, sin CAPTCHA: esa es la vía automática de
 * LURIS para Tyba. Ver docs/plataformas/tyba.md.
 */

/** Sistema de origen de un expediente o una actuación que llega por la CPNU. */
export type SistemaDeOrigen = 'TYBA';

/**
 * Descarga pública de archivos de Tyba. Pide el número de certificación, el código del proceso y
 * un texto de imagen (CAPTCHA): LURIS no lo resuelve (§6), así que la persona hace la descarga y
 * sube el archivo a la actuación («Agregar documento»).
 */
export const URL_DE_DESCARGA_DE_TYBA =
  'https://procesojudicial.ramajudicial.gov.co/Justicia21/Administracion/Descargas/frmDescargaArchivos.aspx';

/**
 * ¿El expediente de la CPNU es de Tyba? La CPNU marca los expedientes de Justicia XXI Web con la
 * ubicación «Software: Justicia XXI Web» (los del sistema anterior traen la ubicación física, p. ej.
 * «Secretaria - Estado» o «Archivo»). Es la señal que se observó en el spike (17/11/2026, un
 * proceso real con los dos registros); si la CPNU la cambia, solo se ajusta esta función.
 */
export function esExpedienteDeTyba(ubicacion: string | null): boolean {
  return ubicacion !== null && /^software:\s*justicia xxi web\b/i.test(ubicacion.trim());
}

/** Dónde nació la actuación, para mostrarla: «Tyba, vía la Rama Judicial» o la plataforma. */
export function etiquetaDeOrigen(
  plataforma: CodigoPlataforma,
  origen: CodigoPlataforma | null,
): string {
  if (origen === 'TYBA') return `${NOMBRES_DE_PLATAFORMA.TYBA}, vía la Rama Judicial`;
  return NOMBRES_DE_PLATAFORMA[plataforma];
}
