/**
 * Tipo real de un documento, leído de su contenido (los primeros bytes), no del nombre ni de lo
 * que declare la plataforma (§8). Solo se aceptan los formatos que publican los juzgados.
 */

export interface TipoDeArchivo {
  readonly mime: string;
  readonly extension: string;
  /** Se puede mostrar dentro de LURIS (el navegador lo abre); si no, solo se descarga. */
  readonly visibleEnLinea: boolean;
}

const PDF: TipoDeArchivo = { mime: 'application/pdf', extension: 'pdf', visibleEnLinea: true };
const PNG: TipoDeArchivo = { mime: 'image/png', extension: 'png', visibleEnLinea: true };
const JPEG: TipoDeArchivo = { mime: 'image/jpeg', extension: 'jpg', visibleEnLinea: true };
const TIFF: TipoDeArchivo = { mime: 'image/tiff', extension: 'tif', visibleEnLinea: false };
const RTF: TipoDeArchivo = { mime: 'application/rtf', extension: 'rtf', visibleEnLinea: false };
const DOC: TipoDeArchivo = { mime: 'application/msword', extension: 'doc', visibleEnLinea: false };
const XLS: TipoDeArchivo = {
  mime: 'application/vnd.ms-excel',
  extension: 'xls',
  visibleEnLinea: false,
};
const DOCX: TipoDeArchivo = {
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: 'docx',
  visibleEnLinea: false,
};
const XLSX: TipoDeArchivo = {
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extension: 'xlsx',
  visibleEnLinea: false,
};

export const TIPOS_ADMITIDOS: readonly TipoDeArchivo[] = [
  PDF,
  PNG,
  JPEG,
  TIFF,
  RTF,
  DOC,
  XLS,
  DOCX,
  XLSX,
];

function empiezaCon(contenido: Uint8Array, firma: readonly number[], desde = 0): boolean {
  if (contenido.length < desde + firma.length) return false;
  return firma.every((byte, i) => contenido[desde + i] === byte);
}

function contieneTexto(contenido: Uint8Array, texto: string, hasta: number): boolean {
  const buscado = new TextEncoder().encode(texto);
  const limite = Math.min(contenido.length, hasta) - buscado.length;
  for (let i = 0; i <= limite; i++) {
    if (buscado.every((byte, j) => contenido[i + j] === byte)) return true;
  }
  return false;
}

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto >= 0 ? nombre.slice(punto + 1).toLowerCase() : '';
}

/** Tipo real del documento, o null si no es un formato admitido. */
export function detectarTipoDeArchivo(contenido: Uint8Array, nombre: string): TipoDeArchivo | null {
  // %PDF- (algunos generadores ponen basura antes: se busca en el primer KB, como los lectores).
  if (contieneTexto(contenido, '%PDF-', 1024)) return PDF;
  if (empiezaCon(contenido, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (empiezaCon(contenido, [0xff, 0xd8, 0xff])) return JPEG;
  if (
    empiezaCon(contenido, [0x49, 0x49, 0x2a, 0x00]) ||
    empiezaCon(contenido, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return TIFF;
  }
  if (empiezaCon(contenido, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return RTF; // {\rtf
  // Documentos de Office antiguos (contenedor OLE): .doc o .xls según el nombre.
  if (empiezaCon(contenido, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return extension(nombre) === 'xls' ? XLS : DOC;
  }
  // Office moderno (ZIP con [Content_Types].xml). Un ZIP cualquiera no se admite.
  if (empiezaCon(contenido, [0x50, 0x4b, 0x03, 0x04])) {
    const esOffice = contieneTexto(contenido, '[Content_Types].xml', 64 * 1024);
    if (!esOffice) return null;
    if (contieneTexto(contenido, 'xl/', 64 * 1024) || extension(nombre) === 'xlsx') return XLSX;
    return DOCX;
  }
  return null;
}

/** El tipo de un documento ya guardado (por su MIME validado). */
export function tipoPorMime(mime: string): TipoDeArchivo | null {
  return TIPOS_ADMITIDOS.find((tipo) => tipo.mime === mime) ?? null;
}

/** Nombre para descargar: el de la plataforma, con la extensión del tipo real. */
export function nombreDeDescarga(nombre: string, tipo: TipoDeArchivo): string {
  const limpio = nombre
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = limpio === '' ? 'documento' : limpio;
  return extension(base) === tipo.extension ? base : `${base}.${tipo.extension}`;
}
