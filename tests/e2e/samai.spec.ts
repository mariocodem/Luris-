import { expect, test, type Locator, type Page } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * SAMAI (Fase 7) con un SAMAI simulado: datos del proceso por la búsqueda pública, credenciales
 * cifradas con su prueba de acceso, y documentos agregados a mano a una actuación.
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

async function consultarAhora(page: Page, texto: string): Promise<void> {
  await page.getByRole('button', { name: 'Consultar ahora' }).click();
  await expect(page.locator('[data-sonner-toast]', { hasText: texto }).first()).toBeVisible({
    timeout: 45_000,
  });
}

test('un proceso de lo contencioso administrativo trae sus datos de SAMAI', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await registrar(page, '05001-23-33-000-2016-00132-00', 'Nulidad y restablecimiento');
  await consultarAhora(page, 'Actualizamos los datos del proceso en SAMAI');

  await page.reload();
  await expect(visible(page.getByRole('heading', { name: 'Según SAMAI' }))).toBeVisible();
  await expect(
    visible(
      page.getByText('Despacho Transitorio 803 Tribunal Administrativo de Antioquia'),
    ).first(),
  ).toBeVisible();
  await expect(
    visible(page.getByText('Las actuaciones de este proceso llegan por la Rama Judicial')),
  ).toBeVisible();
  const enlace = visible(page.getByRole('link', { name: 'Ver el proceso en SAMAI' }));
  await expect(enlace).toHaveAttribute(
    'href',
    /\/samai\/Vistas\/Casos\/list_procesos\.aspx\?guid=050012333000201600132000500123$/,
  );
  await expect(enlace).toHaveAttribute('target', '_blank');
});

test('el abogado guarda su cuenta de SAMAI cifrada, LURIS prueba el acceso y puede borrarla', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogado);
  await page.goto('/ajustes');
  await page.getByRole('link', { name: /Cuentas en las plataformas/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plataformas' })).toBeVisible();

  const usuario = page.getByRole('textbox', { name: 'Usuario' });
  const clave = page.getByLabel('Contraseña', { exact: true });

  // Sin autorizar, no se guarda.
  await usuario.fill('abogado.samai');
  await clave.fill('clave-equivocada');
  await page.getByRole('button', { name: 'Guardar credencial' }).click();
  await expect(
    page.getByText('Para guardar la credencial debes autorizar a LURIS a usarla.'),
  ).toBeVisible();

  // Con una contraseña equivocada: se guarda y la prueba de acceso lo dice.
  await clave.fill('clave-equivocada');
  await page.getByRole('checkbox', { name: /Autorizo a LURIS/ }).check();
  await page.getByRole('button', { name: 'Guardar credencial' }).click();
  await expect(page.getByText(/Credencial guardada/).first()).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByText('La plataforma no aceptó el usuario o la contraseña.', { exact: false }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  // La contraseña nunca vuelve a la página.
  expect(await page.content()).not.toContain('clave-equivocada');

  // La reemplaza por la correcta.
  await page.getByRole('textbox', { name: 'Usuario' }).fill('abogado.samai');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-correcta');
  await page.getByRole('checkbox', { name: /Autorizo a LURIS/ }).check();
  await page.getByRole('button', { name: 'Reemplazar credencial' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('Acceso verificado')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByText('Credencial eliminada. LURIS ya no la usará.').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Acceso verificado')).toHaveCount(0);
});

test('el asistente no gestiona credenciales', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.asistente);
  await page.goto('/ajustes');
  await expect(page.getByRole('link', { name: /Cuentas en las plataformas/ })).toHaveCount(0);
  await page.goto('/ajustes/plataformas');
  await expect(page.getByRole('heading', { level: 1, name: 'Plataformas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar credencial' })).toHaveCount(0);
});

test('un documento descargado de la plataforma se agrega a mano a la actuación', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await registrar(page, '11001-31-03-001-2019-00123-00', 'Tutela con documentos');
  await consultarAhora(page, 'Trajimos 9 actuaciones de la Rama Judicial');
  await page.reload();

  const actuacion = visible(
    page.getByRole('listitem').filter({ hasText: 'Sentencia tutela primera Instancia' }),
  );
  const campo = actuacion.locator('input[type="file"]');

  // Un formato no admitido se rechaza con un mensaje claro.
  await campo.setInputFiles({
    name: 'notas.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hola'),
  });
  await expect(page.getByText(/no es un PDF/).first()).toBeVisible();

  await campo.setInputFiles({
    name: 'Sentencia.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    ),
  });
  await expect(page.getByText('Documento agregado: Sentencia.pdf.').first()).toBeVisible();
  await expect(actuacion.getByRole('link', { name: 'Ver' })).toBeVisible();
  await expect(actuacion).toContainText('Sentencia.pdf');
});
