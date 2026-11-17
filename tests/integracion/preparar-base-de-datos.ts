import type { TestProject } from 'vitest/node';
import {
  cargarEntorno,
  ejecutarPrisma,
  recrearBaseDeDatos,
  urlDePruebas,
} from '../apoyo/base-de-datos';

declare module 'vitest' {
  export interface ProvidedContext {
    urlBaseDeDatosPruebas: string;
  }
}

/**
 * Preparación global de las pruebas de integración:
 * 1. Recrea desde cero la base de datos de pruebas (nunca la de desarrollo).
 * 2. Le aplica todas las migraciones con `prisma migrate deploy`: si una migración no aplica
 *    limpia sobre una base vacía, las pruebas fallan.
 */
export default async function preparar(project: TestProject): Promise<void> {
  cargarEntorno();
  const url = urlDePruebas('_test', process.env.TEST_DATABASE_URL);

  await recrearBaseDeDatos(url, '_test');
  ejecutarPrisma(
    url,
    ['migrate', 'deploy'],
    'Las migraciones no aplicaron limpias sobre una base vacía',
  );

  project.provide('urlBaseDeDatosPruebas', url.toString());
}
