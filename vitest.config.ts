import { defineConfig } from 'vitest/config';

const PRUEBAS_DE_INTEGRACION = ['src/**/*.integracion.test.ts', 'tests/**/*.integracion.test.ts'];

export default defineConfig({
  resolve: {
    // Resuelve el alias "@/*" definido en tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/domain/**', 'src/**/application/**', 'src/shared/infrastructure/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unidad',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: PRUEBAS_DE_INTEGRACION,
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          environment: 'node',
          include: PRUEBAS_DE_INTEGRACION,
          // Crea una base de datos de pruebas limpia y le aplica todas las migraciones.
          globalSetup: ['./tests/integracion/preparar-base-de-datos.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
