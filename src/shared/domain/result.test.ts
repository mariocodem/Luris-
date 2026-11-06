import { describe, expect, it } from 'vitest';
import { andThen, combinar, err, fromPromise, map, mapErr, ok, unwrapOr } from './result';

describe('Result', () => {
  it('ok y err construyen resultados distinguibles por la propiedad ok', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
    expect(err('fallo')).toEqual({ ok: false, error: 'fallo' });
  });

  it('map transforma solo los resultados exitosos', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    expect(map(err<string>('fallo'), (n: number) => n * 10)).toEqual(err('fallo'));
  });

  it('mapErr transforma solo los errores', () => {
    expect(mapErr(err('fallo'), (e) => e.toUpperCase())).toEqual(err('FALLO'));
    expect(mapErr(ok(1), (e: string) => e.toUpperCase())).toEqual(ok(1));
  });

  it('andThen encadena operaciones y se detiene en el primer error', () => {
    const mitad = (n: number) => (n % 2 === 0 ? ok(n / 2) : err(`${n} es impar`));
    expect(andThen(ok(8), mitad)).toEqual(ok(4));
    expect(andThen(ok(3), mitad)).toEqual(err('3 es impar'));
    expect(andThen(err<string>('previo'), mitad)).toEqual(err('previo'));
  });

  it('unwrapOr devuelve el valor por defecto cuando falla', () => {
    expect(unwrapOr(ok('a'), 'b')).toBe('a');
    expect(unwrapOr(err('x'), 'b')).toBe('b');
  });

  it('fromPromise convierte un rechazo en un error tipado', async () => {
    await expect(fromPromise(Promise.resolve(1), () => 'nunca')).resolves.toEqual(ok(1));
    await expect(
      fromPromise(Promise.reject(new Error('timeout')), () => 'PLATAFORMA_NO_DISPONIBLE'),
    ).resolves.toEqual(err('PLATAFORMA_NO_DISPONIBLE'));
  });

  it('combinar reúne todos los valores o todos los errores', () => {
    expect(combinar([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(combinar([ok(1), err('a'), ok(3), err('b')])).toEqual(err(['a', 'b']));
    expect(combinar([])).toEqual(ok([]));
  });
});
