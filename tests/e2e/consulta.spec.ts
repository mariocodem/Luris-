import { expect, test, type Locator, type Page } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Motor de consulta (Fase 5) de punta a punta: «Consultar ahora» encola la consulta, el worker
 * consulta la CPNU (simulada con respuestas grabadas de la API real), guarda las actuaciones y
 * sus documentos, y la ficha muestra las fechas oficiales de la plataforma.
 */
test.describe.configure({ mode: 'serial' });

const visible = (localizador: Locator) => localizador.filter({ visible: true });

const RADICADO = '50001400300120210034300';
const CPNU_SIMULADA = 'http://localhost:3199';
let urlDelProceso = '';

async function consultarAhora(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Consultar ahora' }).click();
  const aviso = page.locator('[data-sonner-toast]', { hasText: 'Rama Judicial' }).last();
  await expect(aviso).toBeVisible({ timeout: 45_000 });
  return aviso;
}

test('la primera consulta trae la historia del proceso con las fechas oficiales', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/procesos/nuevo');
  await page.getByRole('textbox', { name: /^Radicado/ }).fill('50001-40-03-001-2021-00343-00');
  await page.getByRole('textbox', { name: 'Alias', exact: true }).fill('Ejecutivo Bancolombia');
  await page.getByRole('button', { name: 'Registrar proceso' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ejecutivo Bancolombia' }),
  ).toBeVisible();
  urlDelProceso = page.url().split('?')[0] ?? '';
  // Se guardó sin guiones.
  await expect(page.getByRole('button', { name: `Copiar radicado ${RADICADO}` })).toBeVisible();

  await expect(visible(page.getByText('Aún no se ha consultado'))).toBeVisible();
  const aviso = await consultarAhora(page);
  await expect(aviso).toContainText('Trajimos 73 actuaciones de la Rama Judicial');

  // Los datos del proceso según la plataforma, con sus dos expedientes.
  await expect(
    visible(page.getByRole('heading', { name: 'Según la Rama Judicial' })),
  ).toBeVisible();
  await expect(
    visible(page.getByText('JUZGADO 001 CIVIL MUNICIPAL DE VILLAVICENCIO')).first(),
  ).toBeVisible();
  await expect(
    visible(page.getByText('Otro registro de este radicado en la Rama Judicial')),
  ).toBeVisible();
  await expect(visible(page.getByText('73 actuaciones', { exact: true }))).toBeVisible();

  // La más reciente: actuación del 21/10/2026, registrada por el juzgado el 30/10/2026.
  const primera = visible(
    page.getByRole('listitem').filter({ hasText: 'Agregar Memorial' }),
  ).first();
  await expect(primera.locator('time').nth(0)).toHaveText('21/10/2026');
  await expect(primera.locator('time').nth(1)).toHaveText('30/10/2026');
  // Es historia (carga inicial), no una novedad.
  await expect(visible(page.getByText('Nueva ·'))).toHaveCount(0);

  const plataformas = visible(page.getByRole('complementary', { name: 'Datos del proceso' }));
  await expect(plataformas.getByText('Consultado sin problemas')).toBeVisible();
  expect(urlDelProceso).toMatch(/\/procesos\/[0-9a-f-]{36}$/);
});

test('los documentos de la actuación se descargan y se ven dentro de LURIS', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  // El worker los obtiene en segundo plano: se recarga la ficha hasta que estén.
  await expect(async () => {
    await page.goto(urlDelProceso);
    await expect(visible(page.getByRole('link', { name: 'Ver' })).first()).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });

  await visible(page.getByRole('link', { name: 'Ver' }))
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: '44AGREGARMEMORIAL.pdf' }),
  ).toBeVisible();
  const visor = page.locator('iframe[title="Documento: 44AGREGARMEMORIAL.pdf"]');
  await expect(visor).toBeVisible();

  const archivo = await page.request.get((await visor.getAttribute('src')) ?? '');
  expect(archivo.status()).toBe(200);
  expect(archivo.headers()['content-type']).toBe('application/pdf');
  expect(archivo.headers()['x-content-type-options']).toBe('nosniff');
  expect((await archivo.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const descarga = await page.request.get(`${(await visor.getAttribute('src')) ?? ''}?descargar=1`);
  expect(descarga.headers()['content-disposition']).toMatch(
    /^attachment; filename="44AGREGARMEMORIAL\.pdf"/,
  );
});

test('sin sesión, un documento no se entrega: lleva a iniciar sesión', async ({
  page,
  browser,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto(urlDelProceso);
  const enlace = await visible(page.getByRole('link', { name: 'Ver' }))
    .first()
    .getAttribute('href');
  const documentoId = enlace?.split('/').pop() ?? '';

  const anonimo = await browser.newContext();
  const respuesta = await anonimo.request.get(`/api/documentos/${documentoId}`, {
    maxRedirects: 0,
  });
  expect(respuesta.status()).toBe(303);
  expect(respuesta.headers()['location']).toContain('/iniciar-sesion');
  await anonimo.close();
});

test('una nueva consulta detecta solo lo nuevo y lo marca', async ({ page, request }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto(urlDelProceso);
  await expect(await consultarAhora(page)).toContainText(
    'Sin actuaciones nuevas en la Rama Judicial.',
  );

  // El juzgado registra una actuación nueva en la plataforma.
  expect((await request.post(`${CPNU_SIMULADA}/control/nueva-actuacion`)).ok()).toBe(true);
  await page.reload();
  await expect(await consultarAhora(page)).toContainText(
    'Hay una actuación nueva en la Rama Judicial.',
  );

  await expect(visible(page.getByText('74 actuaciones', { exact: true }))).toBeVisible();
  const nueva = visible(
    page.getByRole('listitem').filter({ hasText: 'Auto Fija Fecha Audiencia' }),
  );
  await expect(nueva).toContainText('Nueva ·');
  await expect(nueva.locator('time').nth(0)).toHaveText('13/11/2026');
  await expect(nueva.locator('time').nth(1)).toHaveText('14/11/2026');
});

test('quien no tiene asignado el proceso no puede consultarlo', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.asistente);
  await page.goto(urlDelProceso);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Proceso no encontrado' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar ahora' })).toHaveCount(0);
});
