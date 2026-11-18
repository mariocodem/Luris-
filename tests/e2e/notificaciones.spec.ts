import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import pg from 'pg';
import { urlDePruebas } from '../apoyo/base-de-datos';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Notificaciones (Fase 11) de punta a punta: una actuación nueva detectada por el worker genera
 * exactamente un correo con las fechas oficiales (el transporte de pruebas guarda cada correo como
 * archivo), la persona lo ve en Notificaciones, y las preferencias y la vinculación de WhatsApp se
 * gestionan desde la interfaz. WhatsApp real no se prueba aquí (no se conecta a sus servidores);
 * su gestor se prueba con una sesión simulada en las pruebas unitarias.
 */
test.describe.configure({ mode: 'serial' });

const visible = (localizador: Locator) => localizador.filter({ visible: true });

const CPNU_SIMULADA = 'http://localhost:3199';
const CARPETA_DE_CORREOS = path.join(tmpdir(), 'luris-e2e-correos');
const RADICADO = '50001400300120210034300';

interface Correo {
  readonly archivo: string;
  readonly contenido: string;
  readonly modificado: number;
}

/** Los correos guardados desde `desde` (milisegundos) que contienen `texto`. */
async function correosCon(texto: string, desde: number): Promise<Correo[]> {
  const archivos = await readdir(CARPETA_DE_CORREOS).catch(() => [] as string[]);
  const correos: Correo[] = [];
  for (const archivo of archivos) {
    const ruta = path.join(CARPETA_DE_CORREOS, archivo);
    const modificado = (await stat(ruta)).mtimeMs;
    if (modificado < desde) continue;
    const contenido = await readFile(ruta, 'utf8');
    if (contenido.includes(texto)) correos.push({ archivo, contenido, modificado });
  }
  return correos;
}

async function consultarAhora(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Consultar ahora' }).click();
  await expect(
    page.locator('[data-sonner-toast]', { hasText: 'Rama Judicial' }).last(),
  ).toBeVisible({ timeout: 45_000 });
}

/** El ejecutivo ya existe si corrió consulta.spec.ts; si no, se registra aquí. */
async function abrirElEjecutivo(page: Page): Promise<void> {
  await page.goto(`/procesos?q=${RADICADO}`);
  // Se espera a que la lista termine de cargar antes de decidir si el proceso existe.
  await expect(page.getByRole('heading', { level: 1, name: 'Procesos' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const enlace = visible(page.getByRole('link', { name: /Ejecutivo/ })).first();
  if ((await visible(page.getByRole('link', { name: /Ejecutivo/ })).count()) === 0) {
    await page.goto('/procesos/nuevo');
    await page.getByRole('textbox', { name: /^Radicado/ }).fill(RADICADO);
    await page.getByRole('textbox', { name: 'Alias', exact: true }).fill('Ejecutivo Bancolombia');
    await page.getByRole('button', { name: 'Registrar proceso' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return;
  }
  await enlace.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('una actuación nueva llega por correo, una sola vez, con las fechas oficiales', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await iniciarSesion(page, USUARIOS.administradora);
  await abrirElEjecutivo(page);
  // Primera consulta (si hace falta): es la historia del proceso, no se avisa.
  await consultarAhora(page);

  // El juzgado registra una actuación nueva en la plataforma; LURIS la detecta.
  const inicio = Date.now();
  expect((await request.post(`${CPNU_SIMULADA}/control/nueva-actuacion`)).ok()).toBe(true);
  await page.reload();
  await consultarAhora(page);

  let correos: Correo[] = [];
  await expect(async () => {
    correos = await correosCon('Auto Fija Fecha Audiencia', inicio);
    expect(correos.length).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });

  expect(correos).toHaveLength(1);
  const { contenido } = correos[0] as Correo;
  expect(contenido).toContain('administradora@despacho-demo.test');
  // Las fechas son las que registró la plataforma (13 y 14 de noviembre), no la de hoy.
  expect(contenido).toContain('13/11/2026');
  expect(contenido).toContain('14/11/2026');
  expect(contenido).toContain(RADICADO);
  expect(contenido).toContain('Tyba, vía la Rama Judicial');
  expect(contenido).toMatch(/\/procesos\/[0-9a-f-]{36}/);
  expect(contenido).toContain('/notificaciones');

  // Consultar otra vez no repite el aviso (nada nuevo) ni lo duplica el despachador.
  await consultarAhora(page);
  await page.waitForTimeout(4_000);
  expect(await correosCon('Auto Fija Fecha Audiencia', inicio)).toHaveLength(1);
});

test('al terminar una consulta masiva, quien la hizo recibe el aviso por correo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await iniciarSesion(page, USUARIOS.administradora);
  const inicio = Date.now();
  await page.goto('/consulta-masiva');
  await page.getByRole('textbox', { name: 'Radicados o NUNC' }).fill('76001310300120200077700');
  await page.getByRole('button', { name: 'Revisar lista' }).click();
  await page.getByRole('button', { name: 'Consultar 1 proceso' }).click();
  await expect(page).toHaveURL(/\/consulta-masiva\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const consultaId = page.url().split('/').pop() ?? '';
  await expect(page.getByRole('heading', { name: 'Consulta terminada' })).toBeVisible({
    timeout: 60_000,
  });

  let correos: Correo[] = [];
  await expect(async () => {
    correos = await correosCon(consultaId, inicio);
    expect(correos.length).toBeGreaterThan(0);
  }).toPass({ timeout: 45_000 });
  // Un solo aviso por consulta, aunque el despachador pase muchas veces.
  await page.waitForTimeout(4_000);
  expect(await correosCon(consultaId, inicio)).toHaveLength(1);
  const { contenido } = correos[0] as Correo;
  expect(contenido).toContain('administradora@despacho-demo.test');
  expect(contenido).toContain('Terminó tu consulta masiva');
  expect(contenido).toContain('Con problemas');
});

test('la persona ve el aviso en Notificaciones, con las dos fechas oficiales y su estado', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/notificaciones');
  await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones' })).toBeVisible();

  const aviso = visible(
    page.getByRole('listitem').filter({ hasText: 'Auto Fija Fecha Audiencia' }),
  ).first();
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Correo');
  await expect(aviso).toContainText('Enviada');
  await expect(aviso.locator('time').nth(0)).toHaveText('13/11/2026');
  await expect(aviso.locator('time').nth(1)).toHaveText('14/11/2026');
  await expect(aviso.getByRole('button', { name: `Copiar radicado ${RADICADO}` })).toBeVisible();
  await expect(aviso).not.toContainText(/HTTP|exception|FALLO_TEMPORAL/i);
});

test('las preferencias se validan junto a cada campo y se guardan', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.asistente);
  await page.goto('/notificaciones');
  const seccion = page.getByRole('region', { name: 'Cómo quieres recibirlos' });
  await expect(seccion.getByLabel('Correo electrónico')).toBeChecked();
  await expect(seccion.getByRole('checkbox', { name: /^WhatsApp/ })).not.toBeChecked();

  // WhatsApp sin número ni consentimiento: los dos errores aparecen junto a su campo.
  await seccion.getByRole('checkbox', { name: /^WhatsApp/ }).check();
  // Al activarlo aparecen las advertencias de usar una librería no oficial.
  await expect(seccion.getByText(/no es la API oficial de WhatsApp/)).toBeVisible();
  await seccion.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect(
    seccion.getByText('Escribe tu número de WhatsApp para recibir los avisos.'),
  ).toBeVisible();
  await expect(
    seccion.getByText('Para recibir avisos por WhatsApp debes aceptar que LURIS te escriba.'),
  ).toBeVisible();

  // Un número mal escrito.
  await seccion.getByLabel('Tu número de WhatsApp').fill('123');
  await seccion.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect(seccion.getByText(/Escribe un número de celular válido/)).toBeVisible();

  // Correcto: se guarda normalizado y se muestra con formato.
  await seccion.getByLabel('Tu número de WhatsApp').fill('300 123 4567');
  await seccion.getByLabel(/Acepto que LURIS me escriba por WhatsApp/).check();
  await seccion.getByLabel(/En un resumen diario/).check();
  await seccion.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect(page.getByText('Guardamos tus preferencias de notificación.')).toBeVisible();

  await page.reload();
  const despues = page.getByRole('region', { name: 'Cómo quieres recibirlos' });
  await expect(despues.getByRole('checkbox', { name: /^WhatsApp/ })).toBeChecked();
  await expect(despues.getByLabel('Tu número de WhatsApp')).toHaveValue('+57 300 123 4567');
  await expect(despues.getByLabel(/En un resumen diario/)).toBeChecked();

  // Se deja como estaba: otras pruebas no esperan WhatsApp ni resumen para esta persona.
  await despues.getByRole('checkbox', { name: /^WhatsApp/ }).uncheck();
  await despues.getByLabel(/De inmediato/).check();
  await despues.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect(page.getByText('Guardamos tus preferencias de notificación.')).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Cómo quieres recibirlos' })
      .getByRole('checkbox', { name: /^WhatsApp/ }),
  ).not.toBeChecked();
});

test('solo el administrador gestiona el WhatsApp del despacho, con sus advertencias', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await page.goto('/ajustes');
  await expect(page.getByRole('link', { name: /WhatsApp del despacho/ })).toHaveCount(0);
  await page.goto('/ajustes/whatsapp');
  await expect(page.getByText('Solo el administrador del despacho puede vincular')).toBeVisible();

  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/ajustes');
  await page.getByRole('link', { name: /WhatsApp del despacho/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'WhatsApp del despacho' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'WhatsApp no está vinculado' })).toBeVisible();
  const advertencias = page.getByRole('region', { name: 'Antes de vincular, ten en cuenta' });
  await expect(advertencias).toContainText('no es la API oficial de WhatsApp');
  await expect(advertencias).toContainText('número dedicado');
  await expect(page.getByRole('button', { name: 'Vincular WhatsApp' })).toBeEnabled();
});

test('un WhatsApp ya vinculado muestra su número y se puede desvincular', async ({ page }) => {
  const cliente = new pg.Client({
    connectionString: urlDePruebas('_e2e', process.env.E2E_DATABASE_URL).toString(),
  });
  await cliente.connect();
  try {
    await cliente.query(
      `INSERT INTO sesiones_whatsapp (id, despacho_id, estado, numero, conectada_en, actualizado_en)
       SELECT gen_random_uuid(), id, 'CONECTADA', '573001234567', now(), now() FROM despachos
       WHERE slug = 'despacho-demo'`,
    );
    await iniciarSesion(page, USUARIOS.administradora);
    await page.goto('/ajustes/whatsapp');
    await expect(page.getByRole('heading', { name: 'WhatsApp está vinculado' })).toBeVisible();
    await expect(page.getByText(/Número \+57 300 123 4567/)).toBeVisible();

    await page.getByRole('button', { name: 'Desvincular WhatsApp' }).click();
    await expect(page.getByRole('heading', { name: 'WhatsApp no está vinculado' })).toBeVisible();
    const { rows } = await cliente.query('SELECT estado FROM sesiones_whatsapp');
    expect(rows).toHaveLength(0);
  } finally {
    await cliente.query('DELETE FROM sesiones_whatsapp');
    await cliente.end();
  }
});
