import { describe, expect, it } from 'vitest';
import { reservarCupo } from './cupo';
import type { LimitadorDeIntentos } from './puertos';

/** Limitador de prueba: bloquea tras `maximo` intentos por clave. */
function limitadorDe(maximo: number): LimitadorDeIntentos {
  const cuentas = new Map<string, number>();
  return {
    minutosDeBloqueo: (clave) => ((cuentas.get(clave) ?? 0) >= maximo ? 15 : 0),
    registrarFallo: (clave) => void cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1),
    limpiar: (clave) => void cuentas.delete(clave),
  };
}

describe('reservarCupo', () => {
  it('deja pasar hasta el máximo y después pide esperar, en lenguaje claro', () => {
    const limitador = limitadorDe(3);
    for (let i = 0; i < 3; i += 1) expect(reservarCupo(limitador, 'u1').ok).toBe(true);
    const bloqueado = reservarCupo(limitador, 'u1');
    expect(bloqueado.ok).toBe(false);
    expect(!bloqueado.ok && bloqueado.error.mensajeUsuario).toMatch(/espera \d+ minutos?/);
    expect(!bloqueado.ok && bloqueado.error.mensajeUsuario).not.toMatch(/429|HTTP/);
  });

  it('cada persona tiene su propio cupo', () => {
    const limitador = limitadorDe(1);
    expect(reservarCupo(limitador, 'u1').ok).toBe(true);
    expect(reservarCupo(limitador, 'u1').ok).toBe(false);
    expect(reservarCupo(limitador, 'u2').ok).toBe(true);
  });

  it('sin limitador no limita (pruebas y usos internos)', () => {
    expect(reservarCupo(undefined, 'u1').ok).toBe(true);
  });
});
