import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/shared/domain/logger';
import { crearClienteHttp } from './cliente-http';
import { crearLimitadorDeRitmo } from './limitador-de-ritmo';

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

function cliente(
  fetch: typeof globalThis.fetch,
  opciones: { reintentos?: number; pausado?: boolean } = {},
) {
  const esperas: number[] = [];
  const pausas: number[] = [];
  const limitador = {
    esperarTurno: () =>
      Promise.resolve(opciones.pausado ? ('PAUSADO' as const) : ('LISTO' as const)),
    pausar: (ms: number) => {
      pausas.push(ms);
    },
  };
  const http = crearClienteHttp({
    userAgent: 'LURIS/prueba',
    tiempoLimiteMs: 50,
    reintentos: opciones.reintentos ?? 2,
    esperaBaseMs: 100,
    limitador,
    pausaPorBloqueoMs: 600_000,
    logger: silencioso,
    fetch,
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
  return { http, esperas, pausas };
}

function respuestas(...lista: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const r of lista) {
    if (r instanceof Error) fetch.mockRejectedValueOnce(r);
    else fetch.mockResolvedValueOnce(r);
  }
  return fetch;
}

const json = (cuerpo: unknown, estado = 200, cabeceras: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });

describe('cliente HTTP de plataformas', () => {
  it('envía el User-Agent identificable de LURIS', async () => {
    const fetch = respuestas(json({ a: 1 }));
    await cliente(fetch).http.obtenerJson('https://p.test/x');
    const init = fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('User-Agent')).toBe('LURIS/prueba');
  });

  it('reintenta los 5xx con espera creciente y devuelve el éxito', async () => {
    const fetch = respuestas(json({}, 503), json({}, 502), json({ listo: true }));
    const { http, esperas } = cliente(fetch);
    const resultado = await http.obtenerJson('https://p.test/x');
    expect(resultado).toEqual({ ok: true, value: { estado: 200, cuerpo: { listo: true } } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(esperas).toHaveLength(2);
    expect(esperas[1]).toBeGreaterThan(esperas[0] ?? Infinity);
  });

  it('se rinde tras los reintentos con NO_DISPONIBLE', async () => {
    const fetch = respuestas(json({}, 500), json({}, 500), json({}, 500));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x');
    expect(resultado.ok || resultado.error.tipo).toBe('NO_DISPONIBLE');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('no reintenta un 404: lo devuelve para que el adaptador lo interprete', async () => {
    const fetch = respuestas(json({ Message: 'no' }, 404));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x');
    expect(resultado).toEqual({ ok: true, value: { estado: 404, cuerpo: { Message: 'no' } } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red o un tiempo agotado se reintenta', async () => {
    const fetch = respuestas(new TypeError('fetch failed'), json({ ok: 1 }));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x');
    expect(resultado.ok).toBe(true);
  });

  it('respeta el Retry-After de un 429 y, si persiste, es LIMITE', async () => {
    const fetch = respuestas(json({}, 429, { 'Retry-After': '7' }), json({}, 429), json({}, 429));
    const { http, esperas, pausas } = cliente(fetch);
    const resultado = await http.obtenerJson('https://p.test/x');
    expect(resultado.ok || resultado.error.tipo).toBe('LIMITE');
    expect(esperas).toContain(7000);
    // Si la plataforma sigue pidiendo esperar, se deja de consultarla un tiempo.
    expect(pausas).toEqual([600_000]);
  });

  it('con la plataforma en pausa no hace la solicitud', async () => {
    const fetch = respuestas(json({}));
    const resultado = await cliente(fetch, { pausado: true }).http.obtenerJson('https://p.test/x');
    expect(resultado.ok || resultado.error.tipo).toBe('LIMITE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('una página de error en HTML (p. ej. 403 de un cortafuegos) llega como estado, no como cambio de formato', async () => {
    const fetch = respuestas(new Response('<html>403 Forbidden</html>', { status: 403 }));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x');
    expect(resultado).toEqual({ ok: true, value: { estado: 403, cuerpo: null } });
  });

  it('un cuerpo que no es JSON es FORMATO', async () => {
    const fetch = respuestas(new Response('<html>mantenimiento</html>', { status: 200 }));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x');
    expect(resultado.ok || resultado.error.tipo).toBe('FORMATO');
  });

  it('una señal cancelada detiene todo sin reintentar', async () => {
    const control = new AbortController();
    control.abort();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new DOMException('a', 'AbortError'));
    const resultado = await cliente(fetch).http.obtenerJson('https://p.test/x', control.signal);
    expect(resultado.ok || resultado.error.tipo).toBe('CANCELADO');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('descarga binarios y corta los que pasan del límite', async () => {
    const pequeno = respuestas(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/pdf' } }),
    );
    const ok = await cliente(pequeno).http.obtenerBinario('https://p.test/d', 10);
    expect(ok.ok && [...ok.value.contenido]).toEqual([1, 2, 3]);
    expect(ok.ok && ok.value.tipo).toBe('application/pdf');

    const grande = respuestas(new Response(new Uint8Array(20)));
    const demasiado = await cliente(grande).http.obtenerBinario('https://p.test/d', 10);
    expect(demasiado.ok || demasiado.error.tipo).toBe('DEMASIADO_GRANDE');
  });
});

describe('limitador de ritmo', () => {
  it('en pausa responde PAUSADO sin esperar, hasta que la pausa vence', async () => {
    let ahora = 0;
    const limitador = crearLimitadorDeRitmo({
      solicitudesPorMinuto: 60,
      ahora: () => ahora,
      esperar: async () => {},
    });
    limitador.pausar(300_000);
    expect(await limitador.esperarTurno()).toBe('PAUSADO');
    ahora = 300_001;
    expect(await limitador.esperarTurno()).toBe('LISTO');
  });

  it('separa los turnos según las solicitudes por minuto', async () => {
    let ahora = 1_000;
    const esperas: number[] = [];
    const limitador = crearLimitadorDeRitmo({
      solicitudesPorMinuto: 30, // una cada 2 s
      ahora: () => ahora,
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });
    await limitador.esperarTurno();
    await limitador.esperarTurno();
    await limitador.esperarTurno();
    expect(esperas).toEqual([2_000, 4_000]);

    // Pasado el intervalo, no hay que esperar.
    ahora += 10_000;
    await limitador.esperarTurno();
    expect(esperas).toHaveLength(2);
  });
});
