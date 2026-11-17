import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';

/**
 * Bases de datos desechables para pruebas (integración y e2e). Comparten la instancia de
 * PostgreSQL de desarrollo, pero NUNCA tocan la base de desarrollo: solo recrean bases cuyo
 * nombre termina en el sufijo de pruebas.
 */

export type SufijoDePruebas = '_test' | '_e2e';

/** Carga .env como lo hace Next.js (las pruebas corren fuera de Next). */
export function cargarEntorno(): void {
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => undefined, error: console.error });
}

function nombreDeBase(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

/** URL de la base de pruebas: la explícita, o la de desarrollo con el sufijo. */
export function urlDePruebas(sufijo: SufijoDePruebas, explicita?: string): URL {
  if (explicita) return new URL(explicita);
  const desarrollo = process.env.DATABASE_URL;
  if (!desarrollo) throw new Error('Define DATABASE_URL en .env para las pruebas.');
  const url = new URL(desarrollo);
  const nombre = nombreDeBase(url);
  // Si ya apunta a una base de pruebas (p. ej. dentro del servidor e2e), no repite el sufijo.
  if (!nombre.endsWith(sufijo)) url.pathname = `/${nombre}${sufijo}`;
  return url;
}

/** Borra y vuelve a crear la base de pruebas, vacía. */
export async function recrearBaseDeDatos(url: URL, sufijo: SufijoDePruebas): Promise<void> {
  const nombre = nombreDeBase(url);
  // Salvaguarda: esto BORRA la base. Solo se permite sobre bases de pruebas.
  if (!new RegExp(`^[a-z0-9_]+${sufijo}$`).test(nombre)) {
    throw new Error(
      `Por seguridad solo se recrean bases terminadas en "${sufijo}" (recibido: "${nombre}").`,
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
      `No se pudo conectar a PostgreSQL en ${url.host} para las pruebas. ` +
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

/**
 * Ejecuta la CLI de Prisma contra la base indicada. Usa el punto de entrada JS con el mismo Node
 * en lugar de node_modules/.bin/prisma: en Windows ese archivo es un script de shell que
 * execFileSync no puede lanzar (ENOENT).
 */
export function ejecutarPrisma(url: URL, argumentos: readonly string[], siFalla: string): void {
  const prisma = createRequire(path.join(process.cwd(), 'package.json')).resolve(
    'prisma/build/index.js',
  );
  try {
    execFileSync(process.execPath, [prisma, ...argumentos], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    });
  } catch (causa) {
    const salida = causa instanceof Error && 'stderr' in causa ? String(causa.stderr) : '';
    throw new Error(`${siFalla}:\n${salida}`, { cause: causa });
  }
}
