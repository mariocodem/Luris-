import { Public_Sans, Source_Serif_4 } from 'next/font/google';

/**
 * Tipografía de LURIS.
 * - Interfaz: Public Sans, una sans humanista de servicio público, sobria y muy legible en
 *   tamaños pequeños, con cifras tabulares para radicados y fechas.
 * - Títulos: Source Serif 4, serif de texto con tamaño óptico: aporta el tono formal sin
 *   recurrir a una display decorativa.
 * Next.js las sirve desde el propio dominio (sin peticiones a Google en tiempo de ejecución).
 */
const interfaz = Public_Sans({
  variable: '--fuente-interfaz',
  subsets: ['latin'],
  display: 'swap',
});

const titulos = Source_Serif_4({
  variable: '--fuente-titulos',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
});

/** Clases que declaran las variables CSS de las fuentes; van en el elemento <html>. */
export const clasesDeFuentes = `${interfaz.variable} ${titulos.variable}`;
