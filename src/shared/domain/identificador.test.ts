import { describe, expect, it } from 'vitest';
import { esNotacionCientifica, reconocerIdentificador } from './identificador';

describe('reconocerIdentificador', () => {
  it.each([
    ['11001-31-03-001-2023-00123-00', 'RADICADO', '11001310300120230012300'],
    ['05001310500220240004500', 'RADICADO', '05001310500220240004500'],
    ['11001-60-00049-2023-00123', 'NUNC', '110016000049202300123'],
    [' 05001 60 00206 2023 00123 ', 'NUNC', '050016000206202300123'],
  ])('reconoce %j como %s', (texto, tipo, valor) => {
    expect(reconocerIdentificador(texto)).toEqual({ ok: true, value: { tipo, valor } });
  });

  it.each([
    ['', 'VACIO', 'Escribe un radicado (23 números) o un NUNC (21 números).'],
    ['sin número', 'VACIO', 'Escribe un radicado (23 números) o un NUNC (21 números).'],
    [
      '1100131030012023001230',
      'LONGITUD_INCORRECTA',
      'Debe tener 23 números (radicado) o 21 (NUNC); este tiene 22.',
    ],
  ])('rechaza %j (%s)', (texto, motivo, mensaje) => {
    const resultado = reconocerIdentificador(texto);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.motivo).toBe(motivo);
    expect(resultado.error.mensajeUsuario).toBe(mensaje);
  });

  it.each(['1.1001310300120231E+22', '1,10013E+22', '5.0016E21', ' 1.1e+22 '])(
    'explica la notación científica de Excel en %j',
    (texto) => {
      const resultado = reconocerIdentificador(texto);
      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.motivo).toBe('NOTACION_CIENTIFICA');
      expect(resultado.error.mensajeUsuario).toMatch(/Formatea la columna como Texto/);
    },
  );

  it('no confunde un radicado normal con notación científica', () => {
    expect(esNotacionCientifica('11001-31-03-001-2023-00123-00')).toBe(false);
    expect(esNotacionCientifica('Exp. 11001310300120230012300')).toBe(false);
  });
});
