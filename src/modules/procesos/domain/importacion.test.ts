import { describe, expect, it } from 'vitest';
import {
  analizarFilas,
  MAXIMO_FILAS_DE_IMPORTACION,
  type AnalisisDeImportacion,
} from './importacion';

const RADICADO = '11001310300120230012300';
const RADICADO_2 = '05001310500220240004500';
const NUNC = '110016000049202300123';

function analisis(filas: string[][]): AnalisisDeImportacion {
  const resultado = analizarFilas(filas);
  if (!resultado.ok) throw new Error(resultado.error.mensajeUsuario);
  return resultado.value;
}

describe('analizarFilas', () => {
  it('reconoce encabezados en español, con tildes y mayúsculas', () => {
    const { validos } = analisis([
      ['Número de radicado', 'Alias', 'Cliente', 'Etiquetas'],
      ['11001-31-03-001-2023-00123-00', 'Restitución', 'Inversiones El Prado', 'Civil; Urgente'],
    ]);
    expect(validos).toEqual([
      {
        fila: 2,
        radicado: RADICADO,
        nunc: null,
        alias: 'Restitución',
        cliente: 'Inversiones El Prado',
        etiquetas: ['Civil', 'Urgente'],
      },
    ]);
  });

  it('sin encabezados: identificador, alias y cliente en las tres primeras columnas', () => {
    const { validos } = analisis([
      [RADICADO, 'Ejecutivo', 'Cooperativa'],
      ['11001 60 00049 2023 00123'],
    ]);
    expect(validos.map((v) => [v.fila, v.radicado, v.nunc, v.alias, v.cliente])).toEqual([
      [1, RADICADO, null, 'Ejecutivo', 'Cooperativa'],
      [2, null, NUNC, null, null],
    ]);
  });

  it('acepta columnas separadas de radicado y NUNC en la misma fila', () => {
    const { validos } = analisis([
      ['Radicado', 'NUNC'],
      [RADICADO, NUNC],
      ['', NUNC.replace('123', '124')],
    ]);
    expect(validos.map((v) => [v.radicado, v.nunc])).toEqual([
      [RADICADO, NUNC],
      [null, '110016000049202300124'],
    ]);
  });

  it('ignora filas vacías y cuenta las filas con su número real en el archivo', () => {
    const { filasConDatos, validos } = analisis([['Radicado'], ['', ''], [RADICADO], ['  ']]);
    expect(filasConDatos).toBe(1);
    expect(validos[0]?.fila).toBe(3);
  });

  it('informa cada fila con error y sigue con las demás', () => {
    const { validos, errores } = analisis([
      ['Radicado', 'Alias'],
      ['11001-31-03-001', 'Corto'],
      [RADICADO, 'Bien'],
      ['', 'Sin número'],
      ['1.1001310300120231E+22', 'Excel'],
      [RADICADO_2, 'a'.repeat(201)],
    ]);
    expect(validos.map((v) => v.fila)).toEqual([3]);
    expect(errores).toEqual([
      {
        fila: 2,
        valor: '11001-31-03-001',
        mensaje: 'El radicado debe tener 23 números; este tiene 12.',
      },
      { fila: 4, valor: '', mensaje: 'La fila no tiene radicado ni NUNC.' },
      {
        fila: 5,
        valor: '1.1001310300120231E+22',
        mensaje: expect.stringMatching(/notación científica/),
      },
      { fila: 6, valor: RADICADO_2, mensaje: 'El alias tiene más de 200 caracteres.' },
    ]);
  });

  it('en una columna genérica explica que se espera radicado o NUNC', () => {
    const { errores } = analisis([['123456']]);
    expect(errores[0]?.mensaje).toBe('Debe tener 23 números (radicado) o 21 (NUNC); este tiene 6.');
  });

  it('quita los duplicados del archivo aunque vengan con distinto formato', () => {
    const { validos, duplicados } = analisis([
      ['Radicado'],
      [RADICADO],
      ['11001-31-03-001-2023-00123-00'],
      [RADICADO_2],
    ]);
    expect(validos.map((v) => v.radicado)).toEqual([RADICADO, RADICADO_2]);
    expect(duplicados).toEqual([{ fila: 3, identificador: RADICADO, primeraFila: 2 }]);
  });

  it('rechaza un archivo vacío o con solo encabezados', () => {
    expect(analizarFilas([]).ok).toBe(false);
    expect(analizarFilas([['', '']]).ok).toBe(false);
    const soloEncabezado = analizarFilas([['Radicado', 'Alias']]);
    expect(!soloEncabezado.ok && soloEncabezado.error.mensajeUsuario).toMatch(
      /solo tiene encabezados/,
    );
  });

  it(`rechaza más de ${MAXIMO_FILAS_DE_IMPORTACION} procesos con un mensaje claro`, () => {
    const filas = Array.from({ length: MAXIMO_FILAS_DE_IMPORTACION + 1 }, () => [RADICADO]);
    const resultado = analizarFilas(filas);
    expect(!resultado.ok && resultado.error.mensajeUsuario).toBe(
      'El archivo tiene 1001 procesos y el máximo por importación es 1000. Divídelo en varios archivos.',
    );
  });

  it('acepta exactamente el máximo', () => {
    const filas = Array.from({ length: MAXIMO_FILAS_DE_IMPORTACION }, (_, i) => [
      String(i).padStart(23, '0'),
    ]);
    expect(analisis(filas).validos).toHaveLength(MAXIMO_FILAS_DE_IMPORTACION);
  });
});
