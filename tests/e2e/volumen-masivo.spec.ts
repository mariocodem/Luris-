import { expect, test } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Consulta masiva con 400 procesos (§7, Fase 10) contra la CPNU simulada: toda la tubería real
 * (acción web → cola → worker → ítems → lote), sin tocar plataformas reales. Va al final del
 * orden de archivos porque registra 400 procesos en el despacho de pruebas.
 *
 * La CPNU simulada no tiene los radicados generados («no encontrado»), salvo el ejecutivo, que sí
 * trae sus 73 actuaciones. El tiempo medido es el de la tubería de LURIS con límites de 600
 * solicitudes por minuto; contra la CPNU real el ritmo lo fija CPNU_SOLICITUDES_POR_MINUTO.
 */
test.describe.configure({ mode: 'serial' });

const EJECUTIVO = '50001400300120210034300';
const TOTAL = 400;

function radicados(cantidad: number): string[] {
  const generados = Array.from(
    { length: cantidad - 1 },
    (_, i) => `76001310300120200${String(i).padStart(6, '0')}`,
  );
  return [EJECUTIVO, ...generados];
}

let urlDeLaConsulta = '';

test('más de 400 procesos no se pueden ejecutar y el resumen dice cuántos sobran', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/consulta-masiva');
  await page
    .getByRole('textbox', { name: 'Radicados o NUNC' })
    .fill(radicados(TOTAL + 1).join('\n'));
  await page.getByRole('button', { name: 'Revisar lista' }).click();
  await expect(page.getByText('Quita 1 o divídela en dos.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar 401 procesos' })).toBeDisabled();
});

test('400 procesos se consultan, se puede abandonar la página y retomarla, y se exporta', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/consulta-masiva');
  await page.getByRole('textbox', { name: 'Radicados o NUNC' }).fill(radicados(TOTAL).join('\n'));
  await page.getByRole('button', { name: 'Revisar lista' }).click();
  await expect(page.getByText('400 procesos válidos', { exact: false }).first()).toBeVisible();

  const inicio = Date.now();
  await page.getByRole('button', { name: 'Consultar 400 procesos' }).click();
  await expect(page).toHaveURL(/\/consulta-masiva\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  urlDeLaConsulta = page.url();

  // Abandonar: la consulta sigue en el worker aunque nadie la mire.
  await page.goto('/inicio');
  await page.waitForTimeout(3_000);
  await page.goto(urlDeLaConsulta);

  await expect(page.getByRole('heading', { name: 'Consulta terminada' })).toBeVisible({
    timeout: 6 * 60_000,
  });
  const segundos = (Date.now() - inicio) / 1000;
  test.info().annotations.push({
    type: 'tiempo',
    description: `${TOTAL} procesos en ${segundos.toFixed(1)} s (${(segundos / TOTAL).toFixed(2)} s por proceso)`,
  });
  console.log(`[medición] ${TOTAL} procesos en ${segundos.toFixed(1)} s`);

  const avance = page.getByRole('region', { name: 'Consulta terminada' });
  await expect(avance).toContainText('de 400 consultas');
  await expect(avance).toContainText('1 listos');
  await expect(avance).toContainText('399 con problemas');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

  // Exportar: un renglón por proceso y plataforma, sin guiones.
  const csv = await page.request.get(`${urlDeLaConsulta}/exportar?formato=csv`);
  expect(csv.status()).toBe(200);
  const filas = (await csv.text()).split('\r\n').filter(Boolean);
  expect(filas).toHaveLength(1 + TOTAL);
  expect(filas.some((f) => f.startsWith(EJECUTIVO))).toBe(true);
});
