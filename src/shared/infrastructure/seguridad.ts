/**
 * Cabeceras de seguridad HTTP de LURIS (Fase 12). Lo usa `next.config.ts`, por eso es TypeScript
 * puro y sin alias de rutas.
 */

export interface CabeceraHttp {
  readonly key: string;
  readonly value: string;
}

/**
 * Política de contenido (CSP). Next.js necesita scripts y estilos en línea para hidratar la
 * página; una política con nonce exigiría renderizar todo de forma dinámica y perder el
 * prerenderizado parcial (Cache Components). Por eso `script-src` admite `'unsafe-inline'`, y el
 * resto es estricto: solo el propio origen, sin plugins, sin `<base>` ajeno y sin que nadie
 * incruste LURIS en otro sitio.
 *
 * `frame-src` permite el visor de documentos (mismo origen) y el portal de la Fiscalía de la
 * consulta asistida del SPOA (§6); si se apunta a otro portal, la página ofrece abrirlo en una
 * pestaña nueva.
 */
export const POLITICA_DE_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' https://*.fiscalia.gov.co",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Una vez al año: los navegadores solo la aplican cuando LURIS se sirve por HTTPS. */
const UN_ANO_EN_SEGUNDOS = 31_536_000;

/** Cabeceras para todas las respuestas. */
export function cabecerasGenerales(opciones: { readonly produccion: boolean }): CabeceraHttp[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    ...(opciones.produccion
      ? [
          {
            key: 'Strict-Transport-Security',
            value: `max-age=${UN_ANO_EN_SEGUNDOS}`,
          },
        ]
      : []),
  ];
}

/**
 * Rutas que llevan la política de contenido: todas menos el visor de documentos, que entrega
 * PDF e imágenes con sus propias cabeceras (una CSP restrictiva rompe el visor de PDF del
 * navegador). Solo en producción: el servidor de desarrollo de Next.js necesita `eval` y sockets.
 */
export const RUTAS_CON_POLITICA_DE_CONTENIDO = '/((?!api/documentos).*)';

export function cabecerasDeContenido(opciones: { readonly produccion: boolean }): CabeceraHttp[] {
  return opciones.produccion
    ? [{ key: 'Content-Security-Policy', value: POLITICA_DE_CONTENIDO }]
    : [];
}
