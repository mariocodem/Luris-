import { describe, expect, it } from 'vitest';
import {
  contarItems,
  leerIdentificadores,
  loteTermino,
  porcentajeDeAvance,
  resultadoDeSincronizacion,
} from './consulta-masiva';

const R1 = '50001400300120210034300';
const R2 = '11001310300120230012300';
const N1 = '110016000049202300123';

describe('leerIdentificadores', () => {
  it('lee radicados con o sin guiones, uno por línea', () => {
    const lectura = leerIdentificadores(`50001-40-03-001-2021-00343-00\n${R2}\r\n`);
    expect(lectura.validos.map((v) => v.valor)).toEqual([R1, R2]);
    expect(lectura.errores).toEqual([]);
  });

  it('lee varios por línea, separados por coma, punto y coma, tabulador o espacios', () => {
    const lectura = leerIdentificadores(`${R1}, ${R2}\n${N1};${R1}\t${R2} ${N1}`);
    expect(lectura.validos.map((v) => v.valor)).toEqual([R1, R2, N1]);
    expect(lectura.repetidos).toBe(3);
  });

  it('reconoce el tipo por la cantidad de números (23 radicado, 21 NUNC)', () => {
    const lectura = leerIdentificadores(`${R1}\n${N1}`);
    expect(lectura.validos.map((v) => v.tipo)).toEqual(['RADICADO', 'NUNC']);
  });

  it('lee un radicado escrito con espacios y puntos dentro del número', () => {
    const lectura = leerIdentificadores(
      '50001 40 03 001 2021 00343 00\n50001.40.03.001.2021.00343.01',
    );
    expect(lectura.validos.map((v) => v.valor)).toEqual([R1, '50001400300120210034301']);
  });

  it('conserva los ceros a la izquierda', () => {
    const lectura = leerIdentificadores('00001400300120210034300');
    expect(lectura.validos[0]?.valor).toBe('00001400300120210034300');
  });

  it('quita repetidos aunque estén escritos distinto, y los cuenta', () => {
    const lectura = leerIdentificadores(`${R1}\n50001-40-03-001-2021-00343-00\n${R1}`);
    expect(lectura.validos).toHaveLength(1);
    expect(lectura.repetidos).toBe(2);
  });

  it('ignora un encabezado sin números en la primera línea', () => {
    const lectura = leerIdentificadores(`Radicado\n${R1}`);
    expect(lectura.validos).toHaveLength(1);
    expect(lectura.errores).toEqual([]);
  });

  it('explica cada error con su línea y en lenguaje claro', () => {
    const lectura = leerIdentificadores(`${R1}\n5000140030012021003430\nhola\n${R2}`);
    expect(lectura.validos).toHaveLength(2);
    expect(lectura.errores).toHaveLength(2);
    expect(lectura.errores[0]).toMatchObject({ linea: 2 });
    expect(lectura.errores[0]?.mensaje).toContain('23 números');
    expect(lectura.errores[0]?.mensaje).toContain('tiene 22');
    expect(lectura.errores[1]).toMatchObject({ linea: 3, texto: 'hola' });
    expect(lectura.errores[1]?.mensaje).not.toMatch(/error|exception|undefined|null/i);
  });

  it('avisa cuando Excel dejó el número en notación científica', () => {
    const lectura = leerIdentificadores('5,00014003001202E+22');
    expect(lectura.errores.length).toBeGreaterThan(0);
  });

  it('un texto vacío no da nada', () => {
    expect(leerIdentificadores('  \n\n')).toEqual({ validos: [], errores: [], repetidos: 0 });
  });

  it('lee 400 líneas rápido', () => {
    const texto = Array.from(
      { length: 400 },
      (_, i) => `50001-40-03-001-2021-${String(i).padStart(5, '0')}-00`,
    ).join('\n');
    const inicio = performance.now();
    const lectura = leerIdentificadores(texto);
    expect(lectura.validos).toHaveLength(400);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe('conteo del lote', () => {
  it('cuenta por estado y calcula el avance', () => {
    const conteo = contarItems([
      'COMPLETADO',
      'COMPLETADO',
      'FALLIDO',
      'PENDIENTE',
      'EN_PROCESO',
      'PENDIENTE_CONFIRMACION',
    ]);
    expect(conteo).toEqual({
      total: 6,
      pendientes: 1,
      enProceso: 1,
      completados: 2,
      fallidos: 1,
      porConfirmar: 1,
    });
    expect(loteTermino(conteo)).toBe(false);
    expect(porcentajeDeAvance(conteo)).toBe(67);
  });

  it('el lote termina aunque queden ítems por confirmar', () => {
    const conteo = contarItems(['COMPLETADO', 'PENDIENTE_CONFIRMACION']);
    expect(loteTermino(conteo)).toBe(true);
    expect(porcentajeDeAvance(conteo)).toBe(100);
  });
});

describe('resultadoDeSincronizacion', () => {
  it('una sincronización exitosa completa el ítem con sus cifras', () => {
    const r = resultadoDeSincronizacion('RAMA_CPNU', {
      tipo: 'SINCRONIZADO',
      nuevas: 3,
      total: 73,
      cargaInicial: false,
      reservado: false,
    });
    expect(r).toMatchObject({
      estado: 'COMPLETADO',
      resultado: 'EXITOSA',
      resumen: { nuevas: 3, total: 73 },
    });
    expect(r.resumen.mensaje).toContain('3 actuaciones');
  });

  it('un fallo deja el motivo en lenguaje claro, sin códigos técnicos', () => {
    const r = resultadoDeSincronizacion('RAMA_CPNU', { tipo: 'FALLIDO', codigo: 'NO_ENCONTRADO' });
    expect(r).toMatchObject({ estado: 'FALLIDO', resultado: 'NO_ENCONTRADO' });
    expect(r.resumen.mensaje).not.toMatch(/NO_ENCONTRADO|404/);
  });
});
