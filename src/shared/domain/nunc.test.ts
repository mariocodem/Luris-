import { describe, expect, it } from 'vitest';
import { crearNunc, esNunc, esquemaNunc, LONGITUD_NUNC } from './nunc';

const VALIDO = '110016000049202300123';
const CON_CERO_INICIAL = '050016000206202300123'; // Medellín: código DANE 05001

/** Convierte dígitos ASCII a dígitos de ancho completo (U+FF10–U+FF19). */
function aAnchoCompleto(digitos: string): string {
  return digitos.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
}

function valorDe(texto: string): string {
  const resultado = crearNunc(texto);
  if (!resultado.ok) throw new Error(`Se esperaba válido: ${resultado.error.mensajeUsuario}`);
  return resultado.value;
}

function mensajeDe(texto: string): string {
  const resultado = crearNunc(texto);
  if (resultado.ok) throw new Error(`Se esperaba inválido: ${texto}`);
  return resultado.error.mensajeUsuario;
}

describe('Nunc', () => {
  it('tiene 21 dígitos', () => {
    expect(LONGITUD_NUNC).toBe(21);
  });

  it.each([
    ['solo dígitos', VALIDO],
    ['con guiones', '11001-60-00049-2023-00123'],
    ['con espacios', '11001 60 00049 2023 00123'],
    ['con puntos', '11001.60.00049.2023.00123'],
    ['con espacios al inicio y al final', '  110016000049202300123  '],
    ['con saltos de línea', '11001\n60\n00049\n2023\n00123'],
    ['con dígitos de ancho completo', aAnchoCompleto(VALIDO)],
  ])('acepta un NUNC %s y lo deja en 21 dígitos', (_caso, texto) => {
    expect(valorDe(texto)).toBe(VALIDO);
  });

  it('conserva los ceros a la izquierda y es siempre texto', () => {
    const nunc = valorDe('05001-60-00206-2023-00123');
    expect(nunc).toBe(CON_CERO_INICIAL);
    expect(typeof nunc).toBe('string');
  });

  it.each([
    [20, '11001600004920230012'],
    [22, '1100160000492023001230'],
    [5, '11001'],
  ])('rechaza %i dígitos diciendo cuántos tiene', (cantidad, texto) => {
    const resultado = crearNunc(texto);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('NUNC_INVALIDO');
    expect(resultado.error.digitosEncontrados).toBe(cantidad);
    expect(resultado.error.mensajeUsuario).toBe(
      `El NUNC debe tener 21 números; este tiene ${cantidad}.`,
    );
  });

  it('con 23 dígitos sugiere que podría ser un radicado', () => {
    expect(mensajeDe('11001-31-03-001-2023-00123-00')).toBe(
      'El NUNC debe tener 21 números; este tiene 23. Si es un radicado de la Rama Judicial (23 números), regístralo en el campo radicado.',
    );
  });

  it.each([[''], ['  '], ['--.--'], ['sin número']])('rechaza %j pidiendo escribirlo', (texto) => {
    expect(mensajeDe(texto)).toBe('Escribe el NUNC: son 21 números.');
  });

  it('esNunc reconoce solo cadenas ya normalizadas de 21 dígitos', () => {
    expect(esNunc(VALIDO)).toBe(true);
    expect(esNunc('11001-60-00049-2023-00123')).toBe(false);
    expect(esNunc('11001310300120230012300')).toBe(false);
  });

  it('esquemaNunc normaliza y traduce los errores', () => {
    expect(esquemaNunc.parse('11001-60-00049-2023-00123')).toBe(VALIDO);
    expect(esquemaNunc.safeParse(42).error?.issues[0]?.message).toBe(
      'Escribe el NUNC: son 21 números.',
    );
  });
});
