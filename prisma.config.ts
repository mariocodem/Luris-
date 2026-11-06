import nextEnv from '@next/env';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env por sí solo. Se usa el mismo cargador de Next.js para que la CLI
// lea exactamente las mismas variables que la aplicación (.env, .env.local, …).
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info: () => undefined,
  error: console.error,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Opcional para `prisma generate` (p. ej. al construir la imagen Docker sin base de datos).
    url: process.env.DATABASE_URL,
  },
});
