import { describe, expect, it } from 'vitest';
import { formatearDia, formatearFechaOficial, isoDeFechaOficial } from './fechas';

describe('formatearFechaOficial', () => {
  it('formatea texto ISO como dd/mm/aaaa', () => {
    expect(formatearFechaOficial('2026-11-03')).toBe('03/11/2026');
  });

  it('no corre el día de una columna `date` (medianoche UTC)', () => {
    // En Bogotá (UTC-5) esta medianoche UTC aún es el día anterior: no debe importar.
    expect(formatearFechaOficial(new Date('2026-01-01T00:00:00Z'))).toBe('01/01/2026');
  });

  it('rechaza texto que no es una fecha', () => {
    expect(() => formatearFechaOficial('3 de noviembre')).toThrow();
  });
});

describe('formatearDia', () => {
  it('usa la zona horaria de Bogotá para los instantes', () => {
    // 02:00 UTC del 15 es todavía el 14 en Bogotá.
    expect(formatearDia(new Date('2026-11-15T02:00:00Z'))).toBe('14/11/2026');
  });
});

describe('isoDeFechaOficial', () => {
  it('da el valor para el atributo datetime', () => {
    expect(isoDeFechaOficial(new Date('2026-11-03T00:00:00Z'))).toBe('2026-11-03');
    expect(isoDeFechaOficial('2026-11-03')).toBe('2026-11-03');
  });
});
