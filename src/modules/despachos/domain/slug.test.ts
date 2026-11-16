import { describe, expect, it } from 'vitest';
import { generarSlug } from './slug';

const FORMATO_DE_LA_BASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('generarSlug', () => {
  it.each([
    ['Gómez & Asociados S.A.S.', 'gomez-asociados-s-a-s'],
    ['  Despacho   Ñoño  ', 'despacho-nono'],
    ['Bufete Jurídico Pérez-Ruiz', 'bufete-juridico-perez-ruiz'],
    ['***', 'despacho'],
  ])('"%s" → "%s"', (nombre, esperado) => {
    expect(generarSlug(nombre)).toBe(esperado);
  });

  it('siempre cumple el formato de la restricción CHECK y mide máximo 100', () => {
    for (const nombre of ['a'.repeat(150), `${'ab '.repeat(60)}`, 'Á-É-Í', '¿?¡!']) {
      const slug = generarSlug(nombre);
      expect(slug).toMatch(FORMATO_DE_LA_BASE);
      expect(slug.length).toBeLessThanOrEqual(100);
    }
  });
});
