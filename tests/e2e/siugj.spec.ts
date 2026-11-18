import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  CODIGO_DE_ACCESO,
  RADICADO_CON_ACCESO,
  RADICADO_SIN_ACCESO,
} from '../apoyo/siugj-simulado';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * SIUGJ (Fase 8) con un SIUGJ simulado: el abogado guarda su cuenta de usuario externo, LURIS
 * consulta sus expedientes con esa cuenta (fechas oficiales, sin acceso) y, cuando SIUGJ pide el
 * código de acceso, la persona lo escribe en LURIS. Nunca se consulta el SIUGJ real.
 */
test.describe.configure({ mode: 'serial' });

const visible = (localizador: Locator) => localizador.filter({ visible: true });

async function registrar(page: Page, radicado: string, alias: string): Promise<void> {
  await page.goto('/procesos/nuevo');
  await page.getByRole('textbox', { name: /^Radicado/ }).fill(radicado);
  await page.getByRole('textbox', { name: 'Alias', exact: true }).fill(alias);
  await page.getByRole('button', { name: 'Registrar proceso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: alias })).toBeVisible();
}

async function consultarAhora(page: Page, texto: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Consultar ahora' }).click();
  await expect(page.locator('[data-sonner-toast]', { hasText: texto }).first()).toBeVisible({
    timeout: 45_000,
  });
}

async function guardarCuenta(page: Page, usuario: string): Promise<Locator> {
  await page.goto('/ajustes/plataformas');
  const seccion = page.getByRole('region', { name: 'SIUGJ' });
  await seccion.getByRole('textbox', { name: 'Usuario' }).fill(usuario);
  await seccion.getByLabel('Contraseña', { exact: true }).fill('clave-correcta');
  await seccion.getByRole('checkbox', { name: /Autorizo a LURIS/ }).check();
  await seccion.getByRole('button', { name: /(Guardar|Reemplazar) credencial/ }).click();
  await expect(page.getByText(/Credencial guardada/).first()).toBeVisible();
  return seccion;
}

test('sin una cuenta de SIUGJ, el proceso laboral lo dice y dice dónde registrarla', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogado);
  await registrar(page, RADICADO_CON_ACCESO, 'Ordinario laboral SIUGJ');
  await consultarAhora(page, /hace falta un usuario de la plataforma/);
});

test('con su cuenta de SIUGJ, LURIS trae el expediente con las fechas oficiales', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogado);
  const seccion = await guardarCuenta(page, 'abogado.siugj');
  await expect(async () => {
    await page.reload();
    await expect(seccion.getByText('Acceso verificado')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  // La contraseña nunca vuelve a la página.
  expect(await page.content()).not.toContain('clave-correcta');

  await page.goto('/procesos');
  await page.getByRole('link', { name: 'Ordinario laboral SIUGJ' }).first().click();
  await consultarAhora(page, 'Trajimos 2 actuaciones de SIUGJ');
  await page.reload();
  const actuacion = visible(
    page.getByRole('listitem').filter({ hasText: 'Auto que fija fecha de audiencia' }),
  ).first();
  await expect(actuacion).toBeVisible();
  // Fecha de actuación y de registro, las de la plataforma (§1.4).
  await expect(actuacion).toContainText('04/11/2026');
  await expect(actuacion).toContainText('05/11/2026');
});

test('si la cuenta no tiene acceso al expediente, dice a quién pedirlo', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.abogado);
  await registrar(page, RADICADO_SIN_ACCESO, 'Laboral sin acceso');
  await consultarAhora(page, /no tiene acceso a este expediente en SIUGJ/);
});

test('cuando SIUGJ pide el código de acceso, la persona lo escribe y LURIS sigue sola', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogada);
  const seccion = await guardarCuenta(page, 'abogada.2fa');

  // La prueba de acceso dispara el segundo factor: LURIS pide el código, no lo busca.
  const campo = seccion.getByRole('textbox', { name: 'Código de acceso' });
  await expect(async () => {
    await page.reload();
    await expect(campo).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  await page.goto('/pendientes');
  await expect(page.getByText('SIUGJ pidió un código de acceso.')).toBeVisible();
  await page.getByRole('link', { name: 'Escribir el código' }).click();

  // Un código sin forma de código se rechaza junto al campo.
  await campo.fill('12');
  await seccion.getByRole('button', { name: 'Enviar código' }).click();
  await expect(seccion.getByText(/entre 4 y 12 letras o números/)).toBeVisible();

  await campo.fill(CODIGO_DE_ACCESO);
  await seccion.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByText(/Código enviado/).first()).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(seccion.getByText('Acceso verificado')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  await expect(campo).toHaveCount(0);
  // El código nunca aparece en la página.
  expect(await page.content()).not.toContain(CODIGO_DE_ACCESO);
});
