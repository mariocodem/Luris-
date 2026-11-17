import { describe, expect, it } from 'vitest';
import {
  fechaOficialComoDate,
  formatearDia,
  formatearFechaOficial,
  isoDeFechaOficial,
  leerFechaOficial,
} from './fechas';

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

describe('leerFechaOficial', () => {
  it('toma el día y descarta la hora que agregan las plataformas', () => {
    expect(leerFechaOficial('2023-01-31T00:00:00')).toBe('2023-01-31');
    expect(leerFechaOficial('2026-11-16T09:39:28.55')).toBe('2026-11-16');
    expect(leerFechaOficial('2019-03-08')).toBe('2019-03-08');
    expect(leerFechaOficial(' 2019-03-08 ')).toBe('2019-03-08');
  });

  it('rechaza días que no existen o formatos ajenos', () => {
    expect(leerFechaOficial('2023-02-30')).toBeNull();
    expect(leerFechaOficial('2023-13-01')).toBeNull();
    expect(leerFechaOficial('31/01/2023')).toBeNull();
    expect(leerFechaOficial('0001-01-01T00:00:00')).toBeNull();
    expect(leerFechaOficial('')).toBeNull();
  });

  it('acepta el 29 de febrero solo en años bisiestos', () => {
    expect(leerFechaOficial('2024-02-29')).toBe('2024-02-29');
    expect(leerFechaOficial('2023-02-29')).toBeNull();
  });
});

describe('fechaOficialComoDate', () => {
  it('da la medianoche UTC del mismo día, que no se corre al formatear', () => {
    const fecha = leerFechaOficial('2023-01-31');
    if (!fecha) throw new Error('fecha inválida');
    const comoDate = fechaOficialComoDate(fecha);
    expect(comoDate.toISOString()).toBe('2023-01-31T00:00:00.000Z');
    expect(formatearFechaOficial(comoDate)).toBe('31/01/2023');
  });
});
