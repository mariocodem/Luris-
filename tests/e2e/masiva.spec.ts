import { expect, test, type Locator } from '@playwright/test';
import pg from 'pg';
import { urlDePruebas } from '../apoyo/base-de-datos';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Consulta masiva (Fase 10) de punta a punta: se pegan radicados y un NUNC, LURIS muestra el
 * resumen, el worker consulta la CPNU simulada en segundo plano, el avance se ve en vivo y el
 * resultado se puede exportar. Lo asistido (SPOA) queda en la bandeja de pendientes.
 */
test.describe.configure({ mode: 'serial' });

const visible = (localizador: Locator) => localizador.filter({ visible: true });

const EJECUTIVO = '50001400300120210034300'; // la CPNU simulada lo conoce (y ya está registrado)
const OTRO_DESCONOCIDO = '76001310300120200088800'; // tampoco lo encuentra
const DESCONOCIDO = '76001310300120200099900'; // la CPNU simulada no lo encuentra
const NUNC = '110016000049202300999'; // SPOA: consulta asistida

const LISTA = [
  'Radicado',
  '50001-40-03-001-2021-00343-00',
  '76001-31-03-001-2020-00888-00, 76001 31 03 001 2020 00999 00',
  NUNC,
  EJECUTIVO,
  '123456',
].join('\n');

let urlDeLaConsulta = '';

test('el resumen previo cuenta lo válido, lo repetido y lo que falla, sin guardar nada', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/consulta-masiva');
  await expect(page.getByRole('heading', { level: 1, name: 'Consulta masiva' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Radicados o NUNC' }).fill(LISTA);
  await page.getByRole('button', { name: 'Revisar lista' }).click();

  await expect(page.getByRole('heading', { name: 'Revisa antes de consultar' })).toBeVisible();
  const resumen = page.getByRole('region', { name: 'Revisa antes de consultar' });
  await expect(resumen).toContainText('4 procesos válidos, 1 con error.');
  // El ejecutivo ya está registrado si corrió antes consulta.spec.ts; los demás se registran.
  await expect(resumen).toContainText(/[34] se registrarán en Procesos/);
  await expect(resumen).toContainText('1 repetidos (se consultan una vez)');
  // El error se explica junto a su línea, en lenguaje claro.
  const problemas = page.getByRole('region', { name: 'Para revisar en tu lista' });
  await expect(problemas).toContainText('123456');
  await expect(problemas).toContainText('Debe tener 23 números');
  await expect(problemas).not.toContainText(/HTTP|error 4|exception/i);
  // Aún no existe ninguna consulta.
  expect(page.url()).toMatch(/\/consulta-masiva$/);
});

test('al consultar, el avance se ve en vivo y los resultados llegan por proceso y plataforma', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/consulta-masiva');
  await page.getByRole('textbox', { name: 'Radicados o NUNC' }).fill(LISTA);
  await page.getByRole('button', { name: 'Revisar lista' }).click();
  await page.getByRole('button', { name: 'Consultar 4 procesos' }).click();

  // La primera vez compila la página de avance (servidor de desarrollo).
  await expect(page).toHaveURL(/\/consulta-masiva\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  urlDeLaConsulta = page.url();
  await expect(
    page.getByRole('progressbar', { name: 'Avance de la consulta masiva' }),
  ).toBeVisible();

  // El worker termina solo; la persona no hace nada.
  await expect(page.getByRole('heading', { name: 'Consulta terminada' })).toBeVisible({
    timeout: 60_000,
  });

  const resultados = page.getByRole('list', { name: 'Resultados de la consulta' });
  const fila = (texto: string) => resultados.getByRole('listitem').filter({ hasText: texto });

  // Un radicado conocido: listo, con sus actuaciones.
  await expect(fila(EJECUTIVO).first()).toContainText('Listo');
  // Otro radicado que la plataforma tampoco tiene: queda con problemas.
  await expect(fila(OTRO_DESCONOCIDO).first()).toContainText('Con problemas');
  // El que la plataforma no encuentra: se explica sin códigos.
  const noEncontrado = fila(DESCONOCIDO).first();
  await expect(noEncontrado).toContainText('Con problemas');
  await expect(noEncontrado).toContainText('No encontramos');
  await expect(noEncontrado).not.toContainText(/404|NO_ENCONTRADO|exception/i);
  // El NUNC espera la confirmación de la persona (SPOA tiene reto).
  const asistido = fila(NUNC).first();
  await expect(asistido).toContainText('Espera tu confirmación');
  await expect(asistido.getByRole('link', { name: 'Consultar' })).toBeVisible();
  // Cada radicado se puede copiar.
  await expect(
    page.getByRole('button', { name: `Copiar radicado ${EJECUTIVO}` }).first(),
  ).toBeVisible();

  const avance = page.getByRole('region', { name: 'Consulta terminada' });
  await expect(avance).toContainText('listos');
  await expect(avance).toContainText('con problemas');
  await expect(avance).toContainText('esperan tu confirmación');
});

test('la consulta se puede dejar y retomar; el filtro y el reintento funcionan', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  // «Cerrar la página»: se vuelve más tarde desde el historial.
  await page.goto('/consulta-masiva');
  await expect(page.getByRole('heading', { name: 'Consultas masivas del despacho' })).toBeVisible();
  await visible(page.getByRole('link', { name: /4 procesos/ }))
    .first()
    .click();
  await expect(page).toHaveURL(urlDeLaConsulta);

  await page.getByRole('link', { name: /^Con problemas \d/ }).click();
  await expect(page).toHaveURL(/\?ver=problemas$/);
  const resultados = page.getByRole('list', { name: 'Resultados de la consulta' });
  await expect(resultados.getByRole('listitem')).toHaveCount(2);

  // Reintentar: vuelve a la cola, se consulta de nuevo y falla igual (la plataforma no lo tiene).
  await resultados.getByRole('button', { name: 'Reintentar' }).first().click();
  await expect(
    page.locator('[data-sonner-toast]', { hasText: 'Volvimos a poner la consulta en la cola' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consulta terminada' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(resultados.getByRole('listitem')).toHaveCount(2);
});

test('exporta los resultados a Excel y CSV, con radicados sin guiones', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  const base = `${urlDeLaConsulta}/exportar`;

  const csv = await page.request.get(`${base}?formato=csv`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(csv.headers()['content-disposition']).toMatch(
    /attachment; filename="consulta-masiva-luris-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const texto = await csv.text();
  expect(texto).toContain(EJECUTIVO);
  expect(texto).toContain(NUNC);
  expect(texto).not.toMatch(/\d{5}-\d{2}-\d{2}/);
  expect(texto.split('\r\n').filter(Boolean).length).toBe(1 + 4);

  const xlsx = await page.request.get(`${base}?formato=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK');
});

test('quien no la hizo no la ve (salvo el administrador), y sin sesión pide iniciar sesión', async ({
  page,
  browser,
}) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await page.goto(urlDeLaConsulta);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Consulta masiva no encontrada' }),
  ).toBeVisible();
  expect((await page.request.get(`${urlDeLaConsulta}/exportar?formato=csv`)).status()).toBe(404);
  // El historial de la abogada no trae la del despacho.
  await page.goto('/consulta-masiva');
  await expect(page.getByRole('heading', { name: 'Consultas masivas del despacho' })).toHaveCount(
    0,
  );

  const anonimo = await browser.newContext();
  const respuesta = await anonimo.request.get(`${urlDeLaConsulta}/exportar?formato=csv`, {
    maxRedirects: 0,
  });
  expect(respuesta.status()).toBe(303);
  expect(respuesta.headers()['location']).toContain('/iniciar-sesion');
  await anonimo.close();
});

test('lo asistido queda en la bandeja de pendientes', async ({ page }) => {
  const cliente = new pg.Client({
    connectionString: urlDePruebas('_e2e', process.env.E2E_DATABASE_URL).toString(),
  });
  await cliente.connect();
  try {
    await iniciarSesion(page, USUARIOS.administradora);
    await page.goto('/pendientes');
    await expect(visible(page.getByText(NUNC)).first()).toBeVisible();
  } finally {
    // Otras pruebas esperan la bandeja vacía: se deja como estaba.
    await cliente.query(
      "UPDATE pendientes_de_confirmacion SET resuelto_en = GREATEST(now(), creado_en) WHERE origen = 'MASIVA' AND resuelto_en IS NULL",
    );
    await cliente.end();
  }
});
