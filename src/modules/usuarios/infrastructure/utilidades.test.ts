import { describe, expect, it } from 'vitest';
import { crearLimitadorEnMemoria, generadorDeTokens } from './utilidades';

describe('crearLimitadorEnMemoria', () => {
  function relojManual(inicio: string) {
    let ahora = new Date(inicio).getTime();
    return {
      ahora: () => new Date(ahora),
      avanzarMinutos: (minutos: number) => {
        ahora += minutos * 60_000;
      },
    };
  }

  it('bloquea al llegar al máximo de fallos y libera al terminar la ventana', () => {
    const reloj = relojManual('2026-11-14T10:00:00Z');
    const limitador = crearLimitadorEnMemoria({ maximoDeFallos: 3, ventanaMinutos: 15, reloj });

    limitador.registrarFallo('email:a@b.co');
    limitador.registrarFallo('email:a@b.co');
    expect(limitador.minutosDeBloqueo('email:a@b.co')).toBe(0);
    limitador.registrarFallo('email:a@b.co');
    expect(limitador.minutosDeBloqueo('email:a@b.co')).toBe(15);

    reloj.avanzarMinutos(10);
    expect(limitador.minutosDeBloqueo('email:a@b.co')).toBe(5);
    reloj.avanzarMinutos(5);
    expect(limitador.minutosDeBloqueo('email:a@b.co')).toBe(0);
  });

  it('las claves son independientes y limpiar reinicia el conteo', () => {
    const limitador = crearLimitadorEnMemoria({ maximoDeFallos: 1, ventanaMinutos: 5 });
    limitador.registrarFallo('ip:1.1.1.1');
    expect(limitador.minutosDeBloqueo('ip:1.1.1.1')).toBeGreaterThan(0);
    expect(limitador.minutosDeBloqueo('ip:2.2.2.2')).toBe(0);
    limitador.limpiar('ip:1.1.1.1');
    expect(limitador.minutosDeBloqueo('ip:1.1.1.1')).toBe(0);
  });
});

describe('generadorDeTokens', () => {
  it('genera tokens únicos y largos, y un hash SHA-256 estable', () => {
    const a = generadorDeTokens.generar();
    const b = generadorDeTokens.generar();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(generadorDeTokens.hash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(generadorDeTokens.hash(a)).toBe(generadorDeTokens.hash(a));
    expect(generadorDeTokens.hash(a)).not.toBe(generadorDeTokens.hash(b));
  });
});
