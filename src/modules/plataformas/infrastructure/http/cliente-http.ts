import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { esperarCancelable, type LimitadorDeRitmo } from './limitador-de-ritmo';

/**
 * Cliente HTTP de los adaptadores de plataformas: `fetch` nativo con tiempo límite, reintentos
 * con espera exponencial para los fallos pasajeros y el limitador de ritmo de la plataforma.
 *
 * Solo reintenta lo que puede mejorar solo: red caída, tiempo agotado, errores 5xx y 429.
 * Las demás respuestas (incluidos 400, 403 y 404) se devuelven tal cual, con su cuerpo si es
 * JSON: cada adaptador sabe qué significan en su plataforma (y puede `pausar` la plataforma si
 * la respuesta indica que frenó a LURIS).
 */

export type FalloHttp =
  | { readonly tipo: 'NO_DISPONIBLE'; readonly detalle: string }
  | { readonly tipo: 'LIMITE'; readonly detalle: string }
  | { readonly tipo: 'CANCELADO' }
  | { readonly tipo: 'FORMATO'; readonly detalle: string }
  | { readonly tipo: 'DEMASIADO_GRANDE' };

export interface RespuestaJson {
  readonly estado: number;
  /** Cuerpo interpretado como JSON; null si estaba vacío. */
  readonly cuerpo: unknown;
}

export interface RespuestaDeTexto {
  readonly estado: number;
  readonly texto: string;
}

export interface RespuestaBinaria {
  readonly estado: number;
  readonly contenido: Uint8Array;
  readonly tipo: string | null;
}

export interface ClienteHttp {
  /** Una respuesta 2xx que no es JSON es FORMATO; en otros estados, el cuerpo no JSON es null. */
  obtenerJson(url: string, signal?: AbortSignal): Promise<Result<RespuestaJson, FalloHttp>>;
  /** POST con cuerpo JSON (búsquedas que el portal hace por POST; deben ser idempotentes). */
  enviarJson(
    url: string,
    cuerpo: unknown,
    signal?: AbortSignal,
  ): Promise<Result<RespuestaJson, FalloHttp>>;
  /** Cuerpo como texto (p. ej. XML), en cualquier estado que no se reintente. */
  obtenerTexto(url: string, signal?: AbortSignal): Promise<Result<RespuestaDeTexto, FalloHttp>>;
  obtenerBinario(
    url: string,
    tamanoMaximo: number,
    signal?: AbortSignal,
  ): Promise<Result<RespuestaBinaria, FalloHttp>>;
  /** Deja de consultar la plataforma por un tiempo (la frenó a LURIS). */
  pausar(): void;
}

export interface OpcionesClienteHttp {
  readonly userAgent: string;
  /** Cabeceras fijas de la plataforma (p. ej. la credencial de un servicio oficial). */
  readonly cabeceras?: Readonly<Record<string, string>>;
  readonly tiempoLimiteMs: number;
  /** Intentos adicionales para fallos pasajeros. */
  readonly reintentos: number;
  /** Espera antes del primer reintento; se duplica en cada uno. */
  readonly esperaBaseMs: number;
  readonly limitador: LimitadorDeRitmo;
  /** Cuánto dejar de consultar la plataforma si frena a LURIS (429 persistente o bloqueo). */
  readonly pausaPorBloqueoMs: number;
  readonly logger: Logger;
  readonly fetch?: typeof fetch;
  readonly esperar?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const ESPERA_MAXIMA_POR_LIMITE_MS = 60_000;

type Intento<T> =
  | { readonly tipo: 'LISTO'; readonly valor: Result<T, FalloHttp> }
  | { readonly tipo: 'REINTENTAR'; readonly fallo: FalloHttp; readonly esperaMs?: number };

export function crearClienteHttp(opciones: OpcionesClienteHttp): ClienteHttp {
  const hacerFetch = opciones.fetch ?? globalThis.fetch;
  const esperar = opciones.esperar ?? esperarCancelable;

  function pausar(): void {
    opciones.limitador.pausar(opciones.pausaPorBloqueoMs);
    opciones.logger.warn('Plataforma en pausa: frenó las consultas de LURIS', {
      minutos: Math.round(opciones.pausaPorBloqueoMs / 60_000),
    });
  }

  async function conReintentos<T>(
    url: string,
    signal: AbortSignal | undefined,
    leer: (respuesta: Response) => Promise<Result<T, FalloHttp>>,
    envio?: { readonly cuerpo: string },
  ): Promise<Result<T, FalloHttp>> {
    let ultimoFallo: FalloHttp = { tipo: 'NO_DISPONIBLE', detalle: 'sin intentos' };
    for (let intento = 0; intento <= opciones.reintentos; intento++) {
      if (intento > 0) {
        const espera = opciones.esperaBaseMs * 2 ** (intento - 1);
        const resultado = await esperarSinLanzar(espera + Math.random() * opciones.esperaBaseMs);
        if (!resultado) return err({ tipo: 'CANCELADO' });
      }
      const paso = await intentar(url, signal, leer, envio);
      if (paso.tipo === 'LISTO') return paso.valor;
      ultimoFallo = paso.fallo;
      opciones.logger.warn('Fallo pasajero consultando la plataforma', {
        url,
        intento: intento + 1,
        fallo: paso.fallo,
      });
      if (paso.esperaMs && intento < opciones.reintentos) {
        if (!(await esperarSinLanzar(paso.esperaMs))) return err({ tipo: 'CANCELADO' });
      }
    }
    // Sigue pidiendo esperar después de los reintentos: se deja de consultar por un tiempo.
    if (ultimoFallo.tipo === 'LIMITE') pausar();
    return err(ultimoFallo);

    async function esperarSinLanzar(ms: number): Promise<boolean> {
      try {
        await esperar(ms, signal);
        return true;
      } catch {
        return false;
      }
    }
  }

  async function intentar<T>(
    url: string,
    signal: AbortSignal | undefined,
    leer: (respuesta: Response) => Promise<Result<T, FalloHttp>>,
    envio?: { readonly cuerpo: string },
  ): Promise<Intento<T>> {
    try {
      const turno = await opciones.limitador.esperarTurno(signal);
      if (turno === 'PAUSADO') {
        return {
          tipo: 'LISTO',
          valor: err({ tipo: 'LIMITE', detalle: 'plataforma en pausa: frenó las consultas' }),
        };
      }
    } catch {
      return { tipo: 'LISTO', valor: err({ tipo: 'CANCELADO' }) };
    }
    const tiempoLimite = AbortSignal.timeout(opciones.tiempoLimiteMs);
    const senal = signal ? AbortSignal.any([signal, tiempoLimite]) : tiempoLimite;
    try {
      const respuesta = await hacerFetch(url, {
        method: envio ? 'POST' : 'GET',
        headers: {
          ...opciones.cabeceras,
          'User-Agent': opciones.userAgent,
          Accept: 'application/json, */*',
          ...(envio && { 'Content-Type': 'application/json' }),
        },
        ...(envio && { body: envio.cuerpo }),
        signal: senal,
        redirect: 'follow',
      });
      if (respuesta.status === 429) {
        await respuesta.body?.cancel();
        return {
          tipo: 'REINTENTAR',
          fallo: { tipo: 'LIMITE', detalle: 'HTTP 429' },
          esperaMs: esperaPorLimite(respuesta.headers.get('retry-after')),
        };
      }
      if (respuesta.status >= 500) {
        await respuesta.body?.cancel();
        return {
          tipo: 'REINTENTAR',
          fallo: { tipo: 'NO_DISPONIBLE', detalle: `HTTP ${respuesta.status}` },
        };
      }
      return { tipo: 'LISTO', valor: await leer(respuesta) };
    } catch (causa) {
      if (signal?.aborted) return { tipo: 'LISTO', valor: err({ tipo: 'CANCELADO' }) };
      const detalle = tiempoLimite.aborted
        ? `sin respuesta en ${opciones.tiempoLimiteMs} ms`
        : causa instanceof Error
          ? `${causa.name}: ${causa.message}`
          : 'fallo de red';
      return { tipo: 'REINTENTAR', fallo: { tipo: 'NO_DISPONIBLE', detalle } };
    }
  }

  /** Un 2xx que no es JSON es FORMATO; en otros estados, el cuerpo no JSON queda en null. */
  async function leerJson(respuesta: Response): Promise<Result<RespuestaJson, FalloHttp>> {
    const texto = await respuesta.text();
    if (texto.trim() === '') return ok({ estado: respuesta.status, cuerpo: null });
    try {
      return ok({ estado: respuesta.status, cuerpo: JSON.parse(texto) as unknown });
    } catch {
      // Una página de error (p. ej. el 403 en HTML de un cortafuegos) no es un cambio de formato.
      if (!respuesta.ok) return ok({ estado: respuesta.status, cuerpo: null });
      return err({
        tipo: 'FORMATO',
        detalle: `HTTP ${respuesta.status}: la respuesta no es JSON (${texto.slice(0, 80)})`,
      });
    }
  }

  return {
    obtenerJson(url, signal) {
      return conReintentos(url, signal, leerJson);
    },

    enviarJson(url, cuerpo, signal) {
      return conReintentos(url, signal, leerJson, { cuerpo: JSON.stringify(cuerpo) });
    },

    obtenerTexto(url, signal) {
      return conReintentos(url, signal, async (respuesta) =>
        ok({ estado: respuesta.status, texto: await respuesta.text() }),
      );
    },

    obtenerBinario(url, tamanoMaximo, signal) {
      return conReintentos(url, signal, async (respuesta) => {
        if (!respuesta.ok) {
          await respuesta.body?.cancel();
          return ok({ estado: respuesta.status, contenido: new Uint8Array(), tipo: null });
        }
        const declarado = Number(respuesta.headers.get('content-length'));
        if (Number.isFinite(declarado) && declarado > tamanoMaximo) {
          await respuesta.body?.cancel();
          return err({ tipo: 'DEMASIADO_GRANDE' });
        }
        const contenido = await leerConLimite(respuesta, tamanoMaximo);
        if (!contenido) return err({ tipo: 'DEMASIADO_GRANDE' });
        return ok({
          estado: respuesta.status,
          contenido,
          tipo: respuesta.headers.get('content-type'),
        });
      });
    },

    pausar,
  };
}

/** Lee el cuerpo completo, o null si pasa del límite (deja de leer en cuanto lo supera). */
async function leerConLimite(respuesta: Response, limite: number): Promise<Uint8Array | null> {
  if (!respuesta.body) return new Uint8Array();
  const partes: Uint8Array[] = [];
  let total = 0;
  for await (const parte of respuesta.body) {
    total += parte.byteLength;
    if (total > limite) {
      await respuesta.body.cancel().catch(() => undefined);
      return null;
    }
    partes.push(parte);
  }
  const contenido = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    contenido.set(parte, posicion);
    posicion += parte.byteLength;
  }
  return contenido;
}

/** Respeta el `Retry-After` (en segundos) de un 429, con un tope razonable. */
function esperaPorLimite(retryAfter: string | null): number | undefined {
  const segundos = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(segundos) || segundos < 0) return undefined;
  return Math.min(segundos * 1000, ESPERA_MAXIMA_POR_LIMITE_MS);
}
