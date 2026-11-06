import { describe, expect, it } from 'vitest';
import {
  codigoDeAyudaDesde,
  generarCodigoDeAyuda,
  LONGITUD_CODIGO_DE_AYUDA,
} from './codigo-de-ayuda';

// Crockford Base32: sin I, L, O ni U para evitar confusiones al dictarlo.
const FORMATO = new RegExp(`^[0-9A-HJKMNP-TV-Z]{${LONGITUD_CODIGO_DE_AYUDA}}$`);

describe('código de ayuda', () => {
  it('genera códigos cortos, legibles y sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(generarCodigoDeAyuda()).toMatch(FORMATO);
    }
  });

  it('genera códigos distintos en cada llamada', () => {
    const codigos = new Set(Array.from({ length: 500 }, generarCodigoDeAyuda));
    expect(codigos.size).toBeGreaterThan(495);
  });

  it('deriva siempre el mismo código desde el mismo identificador', () => {
    const digest = '2481928374';
    expect(codigoDeAyudaDesde(digest)).toBe(codigoDeAyudaDesde(digest));
    expect(codigoDeAyudaDesde(digest)).toMatch(FORMATO);
  });

  it('deriva códigos distintos desde identificadores distintos', () => {
    expect(codigoDeAyudaDesde('2481928374')).not.toBe(codigoDeAyudaDesde('2481928375'));
  });
});
