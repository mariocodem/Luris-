import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // La raíz lleva al área del despacho; sin sesión, su layout redirige al inicio de sesión.
  async redirects() {
    return [{ source: '/', destination: '/inicio', permanent: false }];
  },
  async headers() {
    // Las páginas con enlaces de un solo uso no deben filtrar el token en el Referer.
    return ['/invitacion/:token', '/restablecer-contrasena/:token'].map((source) => ({
      source,
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }));
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
