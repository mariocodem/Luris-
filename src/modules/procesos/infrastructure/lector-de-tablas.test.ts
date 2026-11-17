import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizarFilas } from '../domain/importacion';
import { lectorDeTablas, TAMANO_MAXIMO_DE_ARCHIVO } from './lector-de-tablas';

const XLSX = new Uint8Array(readFileSync(path.join(process.cwd(), 'tests/fixtures/procesos.xlsx')));

function csv(texto: string, codificacion: 'utf-8' | 'windows-1252' = 'utf-8'): Uint8Array {
  if (codificacion === 'utf-8') return new TextEncoder().encode(texto);
  // Windows-1252 para el rango latino: cada carácter es un byte.
  return Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
}

async function leer(nombre: string, contenido: Uint8Array) {
  return lectorDeTablas.leer({ nombre, tipo: '', contenido });
}

describe('lectorDeTablas', () => {
  it('lee un .xlsx y deja los números como texto crudo (sin inventar dígitos)', async () => {
    const resultado = await leer('procesos.xlsx', XLSX);
    if (!resultado.ok) throw resultado.error;
    expect(resultado.value).toEqual([
      ['Radicado', 'Alias', 'Cliente', 'Etiquetas'],
      ['11001-31-03-001-2023-00123-00', 'Restitución', 'Inversiones El Prado', 'Civil'],
      ['1.1001310300120231E+22', 'Excel numérico', '', ''],
      ['05001310500220240004500', 'Ordinario laboral', 'Jorge Pérez', 'Laboral, Urgente'],
    ]);

    // De punta a punta con el análisis: el número en notación científica se explica.
    const analisis = analizarFilas(resultado.value);
    if (!analisis.ok) throw analisis.error;
    expect(analisis.value.validos.map((v) => v.radicado)).toEqual([
      '11001310300120230012300',
      '05001310500220240004500',
    ]);
    expect(analisis.value.errores[0]?.mensaje).toMatch(/Formatea la columna como Texto/);
  });

  it('lee CSV con punto y coma (Excel en español) y con coma', async () => {
    for (const separador of [';', ',']) {
      const resultado = await leer(
        'procesos.csv',
        csv(`Radicado${separador}Alias\r\n11001-31-03-001-2023-00123-00${separador}Ejecutivo\r\n`),
      );
      expect(resultado).toEqual({
        ok: true,
        value: [
          ['Radicado', 'Alias'],
          ['11001-31-03-001-2023-00123-00', 'Ejecutivo'],
        ],
      });
    }
  });

  it('respeta las comillas de los campos con separadores dentro', async () => {
    const resultado = await leer('procesos.csv', csv('Radicado,Etiquetas\n123,"Civil, Urgente"\n'));
    expect(resultado.ok && resultado.value[1]).toEqual(['123', 'Civil, Urgente']);
  });

  it('acepta un CSV de una sola columna y quita la marca BOM de UTF-8', async () => {
    const resultado = await leer(
      'lista.csv',
      csv('﻿11001310300120230012300\n05001310500220240004500\n'),
    );
    expect(resultado.ok && resultado.value).toEqual([
      ['11001310300120230012300'],
      ['05001310500220240004500'],
    ]);
  });

  it('entiende los CSV guardados en Windows-1252 (tildes de Excel en español)', async () => {
    const resultado = await leer(
      'procesos.csv',
      csv('Cliente\nJorge García Muñoz\n', 'windows-1252'),
    );
    expect(resultado.ok && resultado.value[1]).toEqual(['Jorge García Muñoz']);
  });

  it.each([
    ['vacío', 'a.csv', new Uint8Array(), /está vacío/],
    [
      'demasiado grande',
      'a.csv',
      new Uint8Array(TAMANO_MAXIMO_DE_ARCHIVO + 1).fill(65),
      /más de 1 MB/,
    ],
    ['de Excel 97-2003', 'a.xls', csv('x'), /\.xls \(Excel 97-2003\)/],
    ['de otro tipo', 'a.pdf', csv('%PDF'), /\.xlsx\) o CSV/],
    ['un .xlsx que no es Excel', 'a.xlsx', csv('no soy un zip'), /no parece un Excel válido/],
  ])('rechaza un archivo %s con un mensaje claro', async (_caso, nombre, contenido, mensaje) => {
    const resultado = await leer(nombre, contenido);
    expect(!resultado.ok && resultado.error.mensajeUsuario).toMatch(mensaje);
  });
});
