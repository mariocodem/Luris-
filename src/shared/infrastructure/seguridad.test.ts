import { describe, expect, it } from 'vitest';
import {
  POLITICA_DE_CONTENIDO,
  RUTAS_CON_POLITICA_DE_CONTENIDO,
  cabecerasDeContenido,
  cabecerasGenerales,
} from './seguridad';

const valor = (cabeceras: { key: string; value: string }[], clave: string) =>
  cabeceras.find((c) => c.key === clave)?.value;

describe('cabeceras de seguridad', () => {
  it('siempre impiden adivinar tipos, incrustar LURIS en otro sitio y filtrar el origen', () => {
    const c = cabecerasGenerales({ produccion: false });
    expect(valor(c, 'X-Content-Type-Options')).toBe('nosniff');
    expect(valor(c, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(valor(c, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valor(c, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(valor(c, 'Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(valor(c, 'Permissions-Policy')).toContain('camera=()');
    expect(valor(c, 'Permissions-Policy')).toContain('microphone=()');
  });

  it('HSTS solo en producción', () => {
    expect(
      valor(cabecerasGenerales({ produccion: false }), 'Strict-Transport-Security'),
    ).toBeUndefined();
    expect(valor(cabecerasGenerales({ produccion: true }), 'Strict-Transport-Security')).toMatch(
      /^max-age=\d+$/,
    );
  });

  it('la política de contenido solo existe en producción', () => {
    expect(cabecerasDeContenido({ produccion: false })).toEqual([]);
    expect(valor(cabecerasDeContenido({ produccion: true }), 'Content-Security-Policy')).toBe(
      POLITICA_DE_CONTENIDO,
    );
  });

  it('la política es estricta con lo que no necesita', () => {
    const directivas = new Map(
      POLITICA_DE_CONTENIDO.split('; ').map((d) => {
        const [nombre, ...valores] = d.split(' ');
        return [nombre, valores] as const;
      }),
    );
    expect(directivas.get('default-src')).toEqual(["'self'"]);
    expect(directivas.get('object-src')).toEqual(["'none'"]);
    expect(directivas.get('frame-ancestors')).toEqual(["'self'"]);
    expect(directivas.get('base-uri')).toEqual(["'self'"]);
    expect(directivas.get('form-action')).toEqual(["'self'"]);
    expect(directivas.get('connect-src')).toEqual(["'self'"]);
    // Sin eval ni orígenes de terceros para scripts.
    expect(directivas.get('script-src')).not.toContain("'unsafe-eval'");
    expect(directivas.get('script-src')).not.toContain('https:');
    // El portal de la Fiscalía se puede mostrar en la consulta asistida.
    expect(directivas.get('frame-src')).toContain('https://*.fiscalia.gov.co');
  });

  it('el visor de documentos queda fuera de la política (rompería el visor de PDF)', () => {
    const regla = new RegExp(`^${RUTAS_CON_POLITICA_DE_CONTENIDO.replace('/((?!', '/((?!')}$`);
    expect(regla.test('/inicio')).toBe(true);
    expect(regla.test('/api/documentos/123')).toBe(false);
  });
});
