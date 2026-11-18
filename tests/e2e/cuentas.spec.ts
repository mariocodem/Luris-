import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Cuentas (Fases 2 y 12) de punta a punta: el administrador invita por correo, la persona crea su
 * contraseña con un enlace de un solo uso, y al desactivar su cuenta pierde el acceso al instante.
 */
test.describe.configure({ mode: 'serial' });

const CARPETA_DE_CORREOS = path.join(tmpdir(), 'luris-e2e-correos');
const CORREO_NUEVO = 'nueva.abogada@despacho-demo.test';
const NOMBRE_NUEVO = 'Valeria Ospina';
const CONTRASENA_NUEVA = 'UnaClaveLarga2026';

let enlace = '';

/** El enlace de invitación del último correo guardado para `para` desde `desde`. */
async function enlaceDeInvitacion(para: string, desde: number): Promise<string | null> {
  const archivos = await readdir(CARPETA_DE_CORREOS).catch(() => [] as string[]);
  for (const archivo of archivos) {
    const ruta = path.join(CARPETA_DE_CORREOS, archivo);
    if ((await stat(ruta)).mtimeMs < desde) continue;
    const contenido = await readFile(ruta, 'utf8');
    if (!contenido.includes(para)) continue;
    const encontrado = /href="(https?:\/\/[^"]*\/invitacion\/[A-Za-z0-9_-]+)"/.exec(contenido);
    if (encontrado?.[1]) return encontrado[1];
  }
  return null;
}

test('el administrador invita por correo y el enlace llega al buzón', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/ajustes/usuarios');
  const inicio = Date.now();
  await page.getByLabel('Correo electrónico').fill(CORREO_NUEVO);
  await page.getByLabel('Rol', { exact: true }).selectOption('abogado');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText(CORREO_NUEVO).first()).toBeVisible();

  await expect(async () => {
    const encontrado = await enlaceDeInvitacion(CORREO_NUEVO, inicio);
    expect(encontrado).not.toBeNull();
    enlace = encontrado ?? '';
  }).toPass({ timeout: 20_000 });
  // El token es largo (256 bits) y no es adivinable.
  expect(enlace.split('/').pop()?.length).toBeGreaterThanOrEqual(40);
});

test('la persona crea su contraseña con el enlace, que sirve una sola vez', async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.goto(enlace);
  await page.getByLabel('Nombre completo').fill(NOMBRE_NUEVO);
  // Una contraseña corta se rechaza junto al campo.
  await page.getByLabel('Crea tu contraseña').fill('corta');
  await page.getByLabel('Repite la contraseña').fill('corta');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByText(/al menos 10|mínimo 10|10 caracteres/i).first()).toBeVisible();

  // Las contraseñas nunca se devuelven al formulario: se espera a que quede vacío.
  await expect(page.getByLabel('Crea tu contraseña')).toHaveValue('');
  await page.getByLabel('Crea tu contraseña').fill(CONTRASENA_NUEVA);
  await page.getByLabel('Repite la contraseña').fill(CONTRASENA_NUEVA);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });
  await expect(page.getByText(NOMBRE_NUEVO).first()).toBeVisible();

  // El mismo enlace no se puede volver a usar.
  const otro = await browser.newContext();
  const pagina = await otro.newPage();
  await pagina.goto(enlace);
  await expect(pagina.getByRole('button', { name: 'Aceptar invitación' })).toHaveCount(0);
  await expect(pagina.locator('body')).not.toContainText(/\b(40[0-9]|50[0-9])\b|exception/i);
  await otro.close();
  await contexto.close();
});

test('al desactivar la cuenta, la persona pierde el acceso en su siguiente página', async ({
  browser,
  page,
}) => {
  const persona = await browser.newContext();
  const suPagina = await persona.newPage();
  await suPagina.goto('/iniciar-sesion');
  await suPagina.getByLabel('Correo electrónico').fill(CORREO_NUEVO);
  await suPagina.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_NUEVA);
  await suPagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(suPagina).toHaveURL(/\/inicio$/);
  await suPagina.goto('/procesos');
  await expect(suPagina.getByRole('heading', { level: 1, name: 'Procesos' })).toBeVisible();

  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/ajustes/usuarios');
  await page.getByRole('button', { name: `Desactivar la cuenta de ${NOMBRE_NUEVO}` }).click();
  await expect(
    page.getByRole('button', { name: `Reactivar la cuenta de ${NOMBRE_NUEVO}` }),
  ).toBeVisible();

  // Su sesión sigue en el navegador, pero el servidor ya no la acepta.
  await suPagina.goto('/procesos');
  await expect(suPagina).not.toHaveURL(/\/procesos$/);
  await expect(suPagina.locator('body')).toContainText(
    /iniciar sesión|no tiene acceso|no tiene acceso a ningún/i,
  );
  // Y tampoco puede volver a entrar.
  await suPagina.goto('/iniciar-sesion');
  await suPagina.getByLabel('Correo electrónico').fill(CORREO_NUEVO);
  await suPagina.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_NUEVA);
  await suPagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(suPagina).not.toHaveURL(/\/inicio$/);
  await persona.close();
});
