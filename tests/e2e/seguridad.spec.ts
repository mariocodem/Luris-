import { expect, test, type Page } from '@playwright/test';
import { CONTRASENA_DE_DESARROLLO, iniciarSesion, USUARIOS } from './apoyo';

/**
 * Seguridad (Fase 12) de punta a punta: cabeceras y cookies, límite de intentos de inicio de
 * sesión, permisos en el servidor, protección contra CSRF en la subida de documentos y mensajes
 * de error comprensibles (nunca códigos HTTP ni trazas, §10).
 */
test.describe.configure({ mode: 'serial' });

const SIN_JERGA = /\b(40[0-9]|50[0-9])\b|exception|stack ?trace|TypeError|undefined|prisma/i;

/** El aviso del formulario (sin el anunciador de rutas de Next.js, que también es un `alert`). */
const avisoDe = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function intentarEntrar(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('las respuestas llevan las cabeceras de seguridad', async ({ request }) => {
  const respuesta = await request.get('/iniciar-sesion');
  const cabeceras = respuesta.headers();
  expect(cabeceras['x-content-type-options']).toBe('nosniff');
  expect(cabeceras['x-frame-options']).toBe('SAMEORIGIN');
  expect(cabeceras['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(cabeceras['permissions-policy']).toContain('camera=()');
  expect(cabeceras['cross-origin-opener-policy']).toBe('same-origin');
  expect(cabeceras['cross-origin-resource-policy']).toBe('same-origin');
  // Next.js no anuncia con qué está hecho.
  expect(cabeceras['x-powered-by']).toBeUndefined();
});

test('la comprobación de salud responde sin sesión y sin revelar detalles', async ({ request }) => {
  const respuesta = await request.get('/api/salud');
  expect(respuesta.status()).toBe(200);
  expect(await respuesta.json()).toEqual({ estado: 'ok' });
  expect(respuesta.headers()['cache-control']).toContain('no-store');
});

test('los enlaces de un solo uso no filtran su token por el Referer ni se guardan en caché', async ({
  request,
}) => {
  const respuesta = await request.get('/restablecer-contrasena/token-de-prueba');
  expect(respuesta.headers()['referrer-policy']).toBe('no-referrer');
  expect(respuesta.headers()['cache-control']).toContain('no-store');
});

test('la cookie de sesión no la lee JavaScript ni viaja a otros sitios', async ({
  page,
  context,
}) => {
  await iniciarSesion(page, USUARIOS.asistente);
  const sesion = (await context.cookies()).find((c) => c.name.startsWith('luris'));
  expect(sesion).toBeDefined();
  expect(sesion?.httpOnly).toBe(true);
  expect(sesion?.sameSite).toBe('Lax');
  expect(sesion?.path).toBe('/');
  // JavaScript de la página no ve la sesión.
  expect(await page.evaluate(() => document.cookie)).not.toContain('luris');
});

test('un correo inexistente y una contraseña equivocada se ven igual (no revela qué cuentas existen)', async ({
  browser,
}) => {
  const contexto = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.10' },
  });
  const page = await contexto.newPage();
  await intentarEntrar(page, USUARIOS.asistente, 'contrasena-equivocada-1');
  const aviso = avisoDe(page);
  await expect(aviso).toBeVisible();
  const conCuenta = await aviso.innerText();
  await intentarEntrar(page, 'nadie-existe@despacho-demo.test', 'contrasena-equivocada-1');
  await expect(avisoDe(page)).toBeVisible();
  expect(await avisoDe(page).innerText()).toBe(conCuenta);
  expect(conCuenta).not.toMatch(SIN_JERGA);
  await contexto.close();
});

test('tras 5 intentos fallidos se pide esperar, aunque después llegue la contraseña correcta', async ({
  browser,
}) => {
  // Una IP propia: el límite por IP no debe afectar a las demás pruebas.
  const contexto = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.20' },
  });
  const page = await contexto.newPage();
  const correo = 'bloqueo-de-prueba@despacho-demo.test';
  for (let i = 0; i < 5; i += 1) await intentarEntrar(page, correo, `mal-${i}-contrasena`);
  await intentarEntrar(page, correo, `mal-final-contrasena`);
  const aviso = avisoDe(page);
  await expect(aviso).toContainText(/demasiados intentos/i);
  await expect(aviso).toContainText(/espera \d+ minutos?/);
  expect(await aviso.innerText()).not.toMatch(SIN_JERGA);

  // Con la contraseña correcta de una cuenta real, pero desde la IP bloqueada, tampoco entra.
  await intentarEntrar(page, USUARIOS.asistente, CONTRASENA_DE_DESARROLLO);
  await expect(avisoDe(page)).toContainText(/demasiados intentos/i);
  await expect(page).toHaveURL(/iniciar-sesion/);
  await contexto.close();
});

test('los permisos se verifican en el servidor: sin sesión, a iniciar sesión; sin rol, un mensaje claro', async ({
  page,
  browser,
}) => {
  // Sin sesión.
  const anonimo = await browser.newContext();
  const pagina = await anonimo.newPage();
  for (const ruta of ['/procesos', '/ajustes/usuarios', '/consulta-masiva', '/notificaciones']) {
    await pagina.goto(ruta);
    await expect(pagina).toHaveURL(/iniciar-sesion/);
  }
  await anonimo.close();

  // Una asistente no administra usuarios ni el WhatsApp del despacho, y no entra al panel de LURIS.
  await iniciarSesion(page, USUARIOS.asistente);
  await page.goto('/ajustes/usuarios');
  await expect(page.locator('body')).not.toContainText(SIN_JERGA);
  await expect(page.getByRole('button', { name: 'Enviar invitación' })).toHaveCount(0);
  await page.goto('/ajustes/whatsapp');
  await expect(page.getByText('Solo el administrador del despacho puede vincular')).toBeVisible();
  await page.goto('/plataforma/despachos');
  await expect(page).toHaveURL(/\/inicio$/);
});

test('una página que no existe se explica en lenguaje humano, sin códigos', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/esto-no-existe');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(SIN_JERGA);
  await page.goto('/procesos/00000000-0000-7000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'No encontramos ese proceso' })).toBeVisible();
});

test('subir un documento desde otro sitio se rechaza (CSRF) y sin tamaño declarado no se lee', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.administradora);
  const ruta =
    '/api/procesos/00000000-0000-7000-8000-000000000000/actuaciones/00000000-0000-7000-8000-000000000001/documentos';
  const archivo = { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') };

  const ajena = await page.request.post(ruta, {
    headers: { 'sec-fetch-site': 'cross-site' },
    multipart: { archivo },
  });
  expect(ajena.status()).toBe(403);
  const cuerpo = (await ajena.json()) as { ok: boolean; mensaje: string };
  expect(cuerpo.ok).toBe(false);
  expect(cuerpo.mensaje).not.toMatch(SIN_JERGA);

  // Desde la propia app sí llega al caso de uso (y, como el proceso no existe, no lo encuentra).
  const propia = await page.request.post(ruta, {
    headers: { 'sec-fetch-site': 'same-origin' },
    multipart: { archivo },
  });
  expect(propia.status()).not.toBe(403);
  expect(((await propia.json()) as { mensaje: string }).mensaje).not.toMatch(SIN_JERGA);
});
