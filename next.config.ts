import type { NextConfig } from 'next';
import {
  RUTAS_CON_POLITICA_DE_CONTENIDO,
  cabecerasDeContenido,
  cabecerasGenerales,
} from './src/shared/infrastructure/seguridad';

const produccion = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Salida mínima para la imagen Docker (Fase 13): un servidor con solo lo que usa la web.
  output: 'standalone',
  // Solo de servidor: se cargan desde node_modules, sin empaquetarlos. Baileys (WhatsApp) corre en el
  // worker y tiene dependencias opcionales que el empaquetador no sabe resolver.
  serverExternalPackages: ['pg-boss', '@whiskeysockets/baileys', 'nodemailer'],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // La importación de procesos sube archivos de hasta 1 MB (el lector impone ese límite con
    // un mensaje claro); el formulario agrega algo de sobrecarga.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // La raíz lleva al área del despacho; sin sesión, su layout redirige al inicio de sesión.
  async redirects() {
    return [{ source: '/', destination: '/inicio', permanent: false }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: cabecerasGenerales({ produccion }) },
      // Next.js no admite una regla sin cabeceras: en desarrollo no hay política de contenido.
      ...(produccion
        ? [
            {
              source: RUTAS_CON_POLITICA_DE_CONTENIDO,
              headers: cabecerasDeContenido({ produccion }),
            },
          ]
        : []),
      // Las páginas con enlaces de un solo uso no deben filtrar el token en el Referer.
      ...['/invitacion/:token', '/restablecer-contrasena/:token'].map((source) => ({
        source,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      })),
    ];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
