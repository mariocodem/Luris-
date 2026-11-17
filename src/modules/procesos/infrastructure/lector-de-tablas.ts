import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorDeImportacion } from '../domain/errores';
import type { ArchivoTabular, LectorDeTablas } from '../application/puertos';

/** Tamaño máximo del archivo de importación (1 MB alcanza para miles de procesos). */
export const TAMANO_MAXIMO_DE_ARCHIVO = 1_000_000;

/** Un .xlsx es un ZIP: empieza con «PK\x03\x04». */
function esZip(contenido: Uint8Array): boolean {
  return (
    contenido[0] === 0x50 && contenido[1] === 0x4b && contenido[2] === 0x03 && contenido[3] === 0x04
  );
}

function extension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto < 0 ? '' : nombre.slice(punto + 1).toLowerCase();
}

/**
 * Texto de un CSV: UTF-8 si lo es; si no, Windows-1252, que es como lo guarda Excel en español
 * en Windows (así «García» no llega como «Garc�a»).
 */
function decodificar(contenido: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(contenido);
  } catch {
    texto = new TextDecoder('windows-1252').decode(contenido);
  }
  return texto.replace(/^﻿/, '');
}

function leerCsv(contenido: Uint8Array): Result<string[][], ErrorDeImportacion> {
  const resultado = Papa.parse<string[]>(decodificar(contenido), {
    skipEmptyLines: 'greedy',
    // Detecta coma, punto y coma (Excel en español), tabulador o barra vertical.
    delimitersToGuess: [';', ',', '\t', '|'],
  });
  // "UndetectableDelimiter" no es grave: un archivo de una sola columna no tiene separador.
  const graves = resultado.errors.filter((e) => e.code !== 'UndetectableDelimiter');
  if (resultado.data.length === 0 && graves.length > 0) {
    return err(
      new ErrorDeImportacion(
        'No pudimos leer el CSV. Ábrelo en Excel y vuelve a guardarlo como «CSV UTF-8».',
        graves.map((e) => e.message).join('; '),
      ),
    );
  }
  return ok(resultado.data.map((fila) => fila.map((celda) => celda.trim())));
}

function celdaComoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'string') return valor.trim();
  return String(valor as number | boolean).trim();
}

async function leerXlsx(contenido: Uint8Array): Promise<Result<string[][], ErrorDeImportacion>> {
  if (!esZip(contenido)) {
    return err(
      new ErrorDeImportacion(
        'El archivo no parece un Excel válido. Ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)» o como CSV.',
      ),
    );
  }
  try {
    // Los números se leen como el texto crudo de la celda: un radicado guardado como número
    // llega en notación científica y el análisis explica cómo corregirlo, en vez de inventarlo.
    const filas = await readSheet<string>(Buffer.from(contenido), {
      parseNumber: (texto) => texto,
    });
    return ok(filas.map((fila) => fila.map(celdaComoTexto)));
  } catch (causa) {
    return err(
      new ErrorDeImportacion(
        'No pudimos leer el Excel. Revisa que no esté protegido con contraseña ni dañado, o guárdalo como CSV.',
        causa instanceof Error ? causa.message : String(causa),
      ),
    );
  }
}

/** Lee la primera hoja de un .xlsx o un .csv como filas de texto. */
export const lectorDeTablas: LectorDeTablas = {
  async leer(archivo: ArchivoTabular) {
    if (archivo.contenido.length === 0) {
      return err(new ErrorDeImportacion('El archivo está vacío. Revisa que sea el correcto.'));
    }
    if (archivo.contenido.length > TAMANO_MAXIMO_DE_ARCHIVO) {
      return err(
        new ErrorDeImportacion(
          'El archivo pesa más de 1 MB. Divídelo en varios archivos más pequeños.',
        ),
      );
    }
    switch (extension(archivo.nombre)) {
      case 'xlsx':
        return leerXlsx(archivo.contenido);
      case 'csv':
      case 'txt':
        return leerCsv(archivo.contenido);
      case 'xls':
        return err(
          new ErrorDeImportacion(
            'Los archivos .xls (Excel 97-2003) no se pueden leer. En Excel, usa «Guardar como» y elige «Libro de Excel (.xlsx)» o «CSV».',
          ),
        );
      default:
        return err(new ErrorDeImportacion('Sube un archivo de Excel (.xlsx) o CSV (.csv).'));
    }
  },
};
