import { expect, type Page } from '@playwright/test';

/** Contraseña de desarrollo de todos los usuarios de la semilla (ver README). */
export const CONTRASENA_DE_DESARROLLO = 'LurisDemo2026';

export const USUARIOS = {
  administradora: 'administradora@despacho-demo.test',
  abogado: 'abogado@despacho-demo.test',
  abogada: 'abogada@despacho-demo.test',
  asistente: 'asistente@despacho-demo.test',
} as const;

export async function iniciarSesion(page: Page, email: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_DE_DESARROLLO);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}
