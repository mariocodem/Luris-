import { execFileSync } from 'node:child_process';
import path from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

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
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });
  const url = urlDePruebas();

  await recrearBaseDeDatos(url);
  aplicarMigraciones(url);

  project.provide('urlBaseDeDatosPruebas', url.toString());
}

function urlDePruebas(): URL {
  const explicita = process.env.TEST_DATABASE_URL;
  const desarrollo = process.env.DATABASE_URL;
  if (!explicita && !desarrollo) {
    throw new Error('Define DATABASE_URL (o TEST_DATABASE_URL) para las pruebas de integración.');
  }
  if (explicita) return new URL(explicita);

  const url = new URL(desarrollo as string);
  url.pathname = `/${nombreDeBase(url)}_test`;
  return url;
}

function nombreDeBase(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

async function recrearBaseDeDatos(url: URL): Promise<void> {
  const nombre = nombreDeBase(url);
  // Salvaguarda: esta preparación BORRA la base. Solo se permite sobre bases de pruebas.
  if (!/^[a-z0-9_]+_test$/.test(nombre)) {
    throw new Error(
      `Por seguridad solo se recrean bases terminadas en "_test" (recibido: "${nombre}").`,
    );
  }

  const mantenimiento = new URL(url);
  mantenimiento.pathname = '/postgres';
  const cliente = new pg.Client({
    connectionString: mantenimiento.toString(),
    connectionTimeoutMillis: 5_000,
  });

  try {
    await cliente.connect();
  } catch (causa) {
    throw new Error(
      `No se pudo conectar a PostgreSQL en ${url.host} para las pruebas de integración. ` +
        'Levanta la base de desarrollo con `pnpm db:up`.',
      { cause: causa },
    );
  }

  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE "${nombre}"`);
  } finally {
    await cliente.end();
  }
}

function aplicarMigraciones(url: URL): void {
  const prisma = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  try {
    execFileSync(prisma, ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    });
  } catch (causa) {
    const salida = causa instanceof Error && 'stderr' in causa ? String(causa.stderr) : '';
    throw new Error(`Las migraciones no aplicaron limpias sobre una base vacía:\n${salida}`, {
      cause: causa,
    });
  }
}
