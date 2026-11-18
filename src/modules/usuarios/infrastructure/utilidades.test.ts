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

describe('limitador en memoria: memoria acotada', () => {
  it('no recuerda sin límite las claves vencidas', () => {
    let ahora = new Date('2026-11-18T10:00:00Z');
    const limitador = crearLimitadorEnMemoria({
      maximoDeFallos: 2,
      ventanaMinutos: 1,
      reloj: { ahora: () => ahora },
    });
    for (let i = 0; i < 10_000; i += 1) limitador.registrarFallo(`email:${i}@x.test`);
    ahora = new Date('2026-11-18T10:05:00Z');
    // Al llegar al tope, las vencidas se descartan y todo sigue funcionando.
    limitador.registrarFallo('nuevo');
    limitador.registrarFallo('nuevo');
    expect(limitador.minutosDeBloqueo('nuevo')).toBeGreaterThan(0);
    expect(limitador.minutosDeBloqueo('email:5@x.test')).toBe(0);
  });
});
