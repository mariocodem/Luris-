import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright-core';
import { z } from 'zod';
import type { Logger } from '@/shared/domain/logger';

/**
 * Navegador automatizado para los portales que necesitan JavaScript e inicio de sesión (SIUGJ).
 * Un solo Chromium por proceso worker, abierto al primer uso; cada consulta usa su propio contexto
 * (cookies aisladas), así las cuentas de distintas personas nunca se mezclan.
 *
 * `canal`: «chromium» usa el Chromium de Playwright (el de la imagen Docker, Fase 13); «msedge» o
 * «chrome» usan el navegador instalado en el equipo (útil en desarrollo, sin descargas).
 */
export type CanalDeNavegador = 'chromium' | 'msedge' | 'chrome';

type EstadoDeSesion = Exclude<NonNullable<BrowserContextOptions['storageState']>, string>;

/** Forma mínima de una sesión guardada (cookies y almacenamiento local de Playwright). */
const esquemaSesion = z.object({
  cookies: z.array(z.object({ name: z.string(), value: z.string(), domain: z.string() }).loose()),
  origins: z.array(z.object({ origin: z.string() }).loose()),
});

/** La sesión guardada, o null si no tiene la forma esperada (se ingresa de nuevo). */
export function leerSesion(texto: string | null): EstadoDeSesion | null {
  if (!texto) return null;
  try {
    const sesion = esquemaSesion.safeParse(JSON.parse(texto));
    // Validada la forma; Playwright completa el resto de los campos opcionales.
    return sesion.success ? (sesion.data as EstadoDeSesion) : null;
  } catch {
    return null;
  }
}

export interface NavegadorAutomatizado {
  nuevoContexto(sesion: string | null): Promise<BrowserContext>;
  cerrar(): Promise<void>;
}

export function crearNavegador(opciones: {
  readonly canal: CanalDeNavegador;
  readonly userAgent: string;
  readonly logger: Logger;
}): NavegadorAutomatizado {
  let navegador: Promise<Browser> | null = null;

  function obtener(): Promise<Browser> {
    // Playwright se carga aquí, al primer uso del worker: la web nunca lo carga (y la imagen Docker
    // de la web no necesita sus navegadores ni su empaquetado).
    navegador ??= import('playwright-core')
      .then(({ chromium }) =>
        chromium.launch({
          headless: true,
          ...(opciones.canal !== 'chromium' && { channel: opciones.canal }),
        }),
      )
      .catch((error: unknown) => {
        navegador = null;
        opciones.logger.error('No se pudo abrir el navegador automatizado', {
          canal: opciones.canal,
          error,
        });
        throw error;
      });
    return navegador;
  }

  return {
    async nuevoContexto(sesion) {
      const estado = leerSesion(sesion);
      return (await obtener()).newContext({
        userAgent: opciones.userAgent,
        locale: 'es-CO',
        timezoneId: 'America/Bogota',
        acceptDownloads: false,
        ...(estado && { storageState: estado }),
      });
    },
    async cerrar() {
      const actual = navegador;
      navegador = null;
      if (actual) await (await actual).close();
    },
  };
}
