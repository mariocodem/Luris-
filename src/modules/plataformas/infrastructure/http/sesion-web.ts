import { err, ok, type Result } from '@/shared/domain/result';
import type { FalloHttp } from './cliente-http';
import type { LimitadorDeRitmo } from './limitador-de-ritmo';

/**
 * Navegación con cookies para portales con inicio de sesión por formulario (p. ej. ASP.NET
 * WebForms en SAMAI). Sigue las redirecciones guardando las cookies, como un navegador, pero sin
 * ejecutar JavaScript. No reintenta: un inicio de sesión repetido puede bloquear la cuenta.
 *
 * Las cookies viven solo en memoria, en esta sesión.
 */
export interface PaginaWeb {
  readonly estado: number;
  /** Dirección final, tras las redirecciones. */
  readonly url: string;
  readonly html: string;
}

export interface SesionWeb {
  obtener(url: string, signal?: AbortSignal): Promise<Result<PaginaWeb, FalloHttp>>;
  enviarFormulario(
    url: string,
    campos: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<Result<PaginaWeb, FalloHttp>>;
}

const MAXIMO_DE_REDIRECCIONES = 5;

export function crearSesionWeb(opciones: {
  readonly userAgent: string;
  readonly tiempoLimiteMs: number;
  readonly limitador: LimitadorDeRitmo;
  readonly fetch?: typeof fetch;
}): SesionWeb {
  const hacerFetch = opciones.fetch ?? globalThis.fetch;
  /** Cookies por sitio (host): nombre → valor. */
  const cookies = new Map<string, Map<string, string>>();

  function guardarCookies(url: URL, respuesta: Response): void {
    const delSitio = cookies.get(url.host) ?? new Map<string, string>();
    for (const cookie of respuesta.headers.getSetCookie()) {
      const [par = ''] = cookie.split(';');
      const igual = par.indexOf('=');
      if (igual <= 0) continue;
      const nombre = par.slice(0, igual).trim();
      const valor = par.slice(igual + 1).trim();
      const caduca = /max-age=0\b|expires=thu, 01 jan 1970/i.test(cookie);
      if (caduca) delSitio.delete(nombre);
      else delSitio.set(nombre, valor);
    }
    cookies.set(url.host, delSitio);
  }

  function cabeceraDeCookies(url: URL): string | undefined {
    const delSitio = cookies.get(url.host);
    if (!delSitio || delSitio.size === 0) return undefined;
    return [...delSitio].map(([nombre, valor]) => `${nombre}=${valor}`).join('; ');
  }

  async function navegar(
    inicial: string,
    signal: AbortSignal | undefined,
    formulario?: Readonly<Record<string, string>>,
  ): Promise<Result<PaginaWeb, FalloHttp>> {
    let url = new URL(inicial);
    let cuerpo = formulario ? new URLSearchParams({ ...formulario }).toString() : undefined;
    for (let salto = 0; salto <= MAXIMO_DE_REDIRECCIONES; salto++) {
      try {
        if ((await opciones.limitador.esperarTurno(signal)) === 'PAUSADO') {
          return err({ tipo: 'LIMITE', detalle: 'plataforma en pausa' });
        }
      } catch {
        return err({ tipo: 'CANCELADO' });
      }
      const tiempo = AbortSignal.timeout(opciones.tiempoLimiteMs);
      let respuesta: Response;
      try {
        respuesta = await hacerFetch(url, {
          method: cuerpo === undefined ? 'GET' : 'POST',
          redirect: 'manual',
          signal: signal ? AbortSignal.any([signal, tiempo]) : tiempo,
          headers: {
            'User-Agent': opciones.userAgent,
            Accept: 'text/html,application/xhtml+xml',
            ...(cuerpo !== undefined && { 'Content-Type': 'application/x-www-form-urlencoded' }),
            ...(cabeceraDeCookies(url) && { Cookie: cabeceraDeCookies(url) }),
          },
          ...(cuerpo !== undefined && { body: cuerpo }),
        });
      } catch {
        if (signal?.aborted) return err({ tipo: 'CANCELADO' });
        return err({
          tipo: 'NO_DISPONIBLE',
          detalle: tiempo.aborted ? 'tiempo agotado' : 'fallo de red',
        });
      }
      guardarCookies(url, respuesta);
      const destino = respuesta.headers.get('location');
      if (respuesta.status >= 300 && respuesta.status < 400 && destino) {
        await respuesta.body?.cancel();
        const siguiente = new URL(destino, url);
        // Tras un POST, la redirección se sigue con GET (303, y 302 en la práctica de los navegadores).
        if (respuesta.status !== 307 && respuesta.status !== 308) cuerpo = undefined;
        // Un formulario (p. ej. con una contraseña) nunca se reenvía a otro sitio.
        if (cuerpo !== undefined && siguiente.host !== url.host) {
          return err({ tipo: 'FORMATO', detalle: 'redirección de un formulario a otro sitio' });
        }
        url = siguiente;
        continue;
      }
      if (respuesta.status === 429) return err({ tipo: 'LIMITE', detalle: 'HTTP 429' });
      if (respuesta.status >= 500) {
        await respuesta.body?.cancel();
        return err({ tipo: 'NO_DISPONIBLE', detalle: `HTTP ${respuesta.status}` });
      }
      return ok({ estado: respuesta.status, url: url.toString(), html: await respuesta.text() });
    }
    return err({ tipo: 'FORMATO', detalle: 'demasiadas redirecciones' });
  }

  return {
    obtener: (url, signal) => navegar(url, signal),
    enviarFormulario: (url, campos, signal) => navegar(url, signal, campos),
  };
}
