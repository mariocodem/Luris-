import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { cargarEntorno, urlDePruebas } from './tests/apoyo/base-de-datos';

/**
 * Pruebas e2e de flujos críticos (Playwright Test). Levantan su propio servidor de Next.js en el
 * puerto 3100 contra la base `<DATABASE_URL>_e2e`, recién creada, migrada y sembrada en cada
 * ejecución (tests/e2e/preparar-entorno.ts): nunca tocan la base de desarrollo.
 *
 * También levantan el worker contra una CPNU simulada con respuestas grabadas
 * (tests/e2e/servicios-de-apoyo.ts): las pruebas nunca consultan la plataforma real.
 *
 * Requiere `pnpm db:up`. Detén `pnpm dev` antes: Next.js no admite dos servidores de
 * desarrollo sobre la misma carpeta.
 */
cargarEntorno();

const PUERTO = 3100;
const URL_BASE = `http://localhost:${PUERTO}`;
const BASE_E2E = urlDePruebas('_e2e', process.env.E2E_DATABASE_URL).toString();
const PUERTO_CPNU_SIMULADA = 3199;

/** Entorno común de la app y el worker de las pruebas. */
const ENTORNO = {
  ...(process.env as Record<string, string>),
  DATABASE_URL: BASE_E2E,
  E2E_DATABASE_URL: BASE_E2E,
  APP_URL: URL_BASE,
  LOG_LEVEL: 'warn',
  // La app sirve los documentos que guarda el worker: deben compartir el almacén.
  ALMACEN_DIRECTORIO: path.join(tmpdir(), 'luris-e2e-almacen'),
  // Los correos (de cuenta y avisos) se guardan como archivos que las pruebas pueden leer.
  CORREO_DIRECTORIO: path.join(tmpdir(), 'luris-e2e-correos'),
  // La consulta asistida del SPOA muestra un portal simulado, nunca el de la Fiscalía.
  SPOA_URL_PORTAL: `http://localhost:${PUERTO_CPNU_SIMULADA}/portal-spoa`,
  // SAMAI simulado (búsqueda pública e ingreso con cuenta).
  SAMAI_URL_BASE: `http://localhost:${PUERTO_CPNU_SIMULADA}/samai`,
  // Clave de cifrado de credenciales solo para las pruebas (si el .env no trae una).
  CREDENCIALES_CLAVE:
    process.env.CREDENCIALES_CLAVE ?? 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
};

export default defineConfig({
  testDir: 'tests/e2e',
  // Comparten la base sembrada: se ejecutan en orden, de a una.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: URL_BASE,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  // En orden: la app prepara la base e2e antes de que arranque el worker.
  webServer: [
    {
      command: 'pnpm exec tsx tests/e2e/preparar-entorno.ts && pnpm exec next dev --port 3100',
      url: `${URL_BASE}/iniciar-sesion`,
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: ENTORNO,
    },
    {
      command: 'pnpm exec tsx tests/e2e/servicios-de-apoyo.ts',
      url: `http://localhost:${PUERTO_CPNU_SIMULADA}/salud`,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...ENTORNO, CPNU_SIMULADA_PUERTO: String(PUERTO_CPNU_SIMULADA) },
    },
  ],
});
