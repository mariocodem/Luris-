import { describe, expect, it } from 'vitest';
import { type FechaOficial, leerFechaOficial } from '@/shared/domain/fechas';
import {
  claveDeDeduplicacion,
  compararActuaciones,
  hashEstable,
  limpiarTexto,
  seleccionarNuevas,
  terminoCoherente,
} from './actuaciones';
import type { ActuacionExterna } from './consulta';

function fecha(texto: string): FechaOficial {
  const f = leerFechaOficial(texto);
  if (!f) throw new Error(texto);
  return f;
}

function actuacion(parciales: Partial<ActuacionExterna> = {}): ActuacionExterna {
  return {
    idExterno: '1402711252',
    expediente: '63376382',
    despachoJudicial: 'JUZGADO 001 CIVIL DEL CIRCUITO DE BOGOTÁ',
    fechaActuacion: fecha('2023-01-31'),
    fechaRegistro: fecha('2023-01-31'),
    descripcion: 'Archivo Definitivo',
    anotacion: 'CAJA 07 - 2022 - ARCHIVO CENTRAL',
    terminoInicia: null,
    terminoVence: null,
    tieneDocumentos: false,
    ...parciales,
  };
}

describe('hashEstable', () => {
  it('es determinista y de 16 caracteres hexadecimales', () => {
    expect(hashEstable('auto admite demanda')).toBe(hashEstable('auto admite demanda'));
    expect(hashEstable('auto admite demanda')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('cambia con cualquier diferencia (incluidas las tildes)', () => {
    expect(hashEstable('Notificación')).not.toBe(hashEstable('Notificacion'));
    expect(hashEstable('')).not.toBe(hashEstable(' '));
  });

  it('da el valor conocido de FNV-1a de 64 bits', () => {
    // Vectores de referencia de FNV-1a 64: la clave no debe cambiar entre versiones.
    expect(hashEstable('')).toBe('cbf29ce484222325');
    expect(hashEstable('a')).toBe('af63dc4c8601ec8c');
  });
});

describe('claveDeDeduplicacion', () => {
  it('usa el identificador de la plataforma cuando existe', () => {
    expect(claveDeDeduplicacion(actuacion())).toBe('1402711252');
  });

  it('sin identificador, usa un hash estable del contenido oficial', () => {
    const sinId = actuacion({ idExterno: null });
    const clave = claveDeDeduplicacion(sinId);
    expect(clave).toMatch(/^h:[0-9a-f]{16}$/);
    expect(claveDeDeduplicacion(actuacion({ idExterno: null }))).toBe(clave);
    expect(claveDeDeduplicacion(actuacion({ idExterno: null, anotacion: 'otra' }))).not.toBe(clave);
    expect(
      claveDeDeduplicacion(actuacion({ idExterno: null, fechaRegistro: fecha('2023-02-01') })),
    ).not.toBe(clave);
  });

  it('no supera los 100 caracteres de la columna', () => {
    expect(claveDeDeduplicacion(actuacion({ idExterno: '9'.repeat(150) }))).toHaveLength(100);
  });
});

describe('seleccionarNuevas', () => {
  const a = actuacion({ idExterno: '1' });
  const b = actuacion({ idExterno: '2' });
  const c = actuacion({ idExterno: '3' });

  it('deja solo las que no están guardadas', () => {
    const nuevas = seleccionarNuevas(new Set(['1', '3']), [a, b, c]);
    expect(nuevas.map((n) => n.clave)).toEqual(['2']);
  });

  it('sin nada guardado, todas son nuevas y llevan su clave', () => {
    expect(seleccionarNuevas(new Set(), [a, b]).map((n) => n.clave)).toEqual(['1', '2']);
  });

  it('quita las repetidas dentro de la misma respuesta', () => {
    expect(seleccionarNuevas(new Set(), [a, a, b]).map((n) => n.clave)).toEqual(['1', '2']);
  });

  it('si todo está guardado, no hay nada nuevo', () => {
    expect(seleccionarNuevas(new Set(['1', '2', '3']), [a, b, c])).toEqual([]);
  });
});

describe('limpiarTexto', () => {
  it('une saltos de línea y tabulaciones dentro de un nombre', () => {
    expect(limpiarTexto('PAULA ANDREA OSORIO\r\n\t\t\t\t\tRUIZ ')).toBe('PAULA ANDREA OSORIO RUIZ');
  });

  it('quita espacios sobrantes y convierte lo vacío en null', () => {
    expect(limpiarTexto('  JUZGADO 001  CIVIL ')).toBe('JUZGADO 001 CIVIL');
    expect(limpiarTexto('   ')).toBeNull();
    expect(limpiarTexto(null)).toBeNull();
    expect(limpiarTexto(undefined)).toBeNull();
  });
});

describe('terminoCoherente', () => {
  it('conserva un término normal', () => {
    expect(terminoCoherente(fecha('2024-03-12'), fecha('2024-03-19'))).toEqual({
      inicia: '2024-03-12',
      vence: '2024-03-19',
    });
  });

  it('descarta un término que vence antes de empezar', () => {
    expect(terminoCoherente(fecha('2024-03-19'), fecha('2024-03-12'))).toEqual({
      inicia: null,
      vence: null,
    });
  });

  it('acepta términos de un solo día o con una sola fecha', () => {
    expect(terminoCoherente(fecha('2024-03-12'), fecha('2024-03-12')).vence).toBe('2024-03-12');
    expect(terminoCoherente(null, fecha('2024-03-12')).vence).toBe('2024-03-12');
  });
});

describe('compararActuaciones', () => {
  it('ordena de la más reciente a la más antigua, y desempata por fecha de registro', () => {
    const vieja = actuacion({ idExterno: 'v', fechaActuacion: fecha('2019-03-08') });
    const reciente = actuacion({ idExterno: 'r', fechaActuacion: fecha('2023-01-31') });
    const mismaFechaRegistroPosterior = actuacion({
      idExterno: 'm',
      fechaActuacion: fecha('2023-01-31'),
      fechaRegistro: fecha('2023-02-02'),
    });
    const orden = [vieja, reciente, mismaFechaRegistroPosterior].sort(compararActuaciones);
    expect(orden.map((a) => a.idExterno)).toEqual(['m', 'r', 'v']);
  });
});
