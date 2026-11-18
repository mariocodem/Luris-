import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Accesibilidad (WCAG 2.2 AA, §11) con axe-core sobre las pantallas principales, en claro y en
 * oscuro, en escritorio y en el ancho de un celular. Cualquier violación hace fallar la prueba.
 */
test.describe.configure({ mode: 'serial' });

const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function revisar(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta);
  await page.waitForLoadState('networkidle');
  await revisarPaginaActual(page, ruta);
}

async function revisarPaginaActual(page: Page, ruta: string): Promise<void> {
  // Se revisa la página ya cargada, no su esqueleto de espera.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page).toHaveTitle(/S/);
  const resultado = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  const resumen = resultado.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes
        .slice(0, 3)
        .map((n) => `${n.target.join(' ')} :: ${n.html.slice(0, 220)}`)
        .join('\n   ')}`,
  );
  expect(resumen, `${ruta}\n${resumen.join('\n')}`).toEqual([]);
}

const PUBLICAS = ['/iniciar-sesion', '/recuperar-contrasena', '/esto-no-existe'];
const PRIVADAS = [
  '/inicio',
  '/procesos',
  '/procesos/nuevo',
  '/procesos/importar',
  '/pendientes',
  '/consulta-masiva',
  '/notificaciones',
  '/ajustes',
  '/ajustes/usuarios',
  '/ajustes/plataformas',
  '/ajustes/whatsapp',
];

const VISTAS = [
  { nombre: 'escritorio claro', ancho: 1280, alto: 860, esquema: 'light' as const },
  { nombre: 'escritorio oscuro', ancho: 1280, alto: 860, esquema: 'dark' as const },
  { nombre: 'celular claro', ancho: 375, alto: 812, esquema: 'light' as const },
  { nombre: 'celular oscuro', ancho: 375, alto: 812, esquema: 'dark' as const },
];

for (const vista of VISTAS) {
  test.describe(vista.nombre, () => {
    test.use({
      viewport: { width: vista.ancho, height: vista.alto },
      colorScheme: vista.esquema,
      // Sin animaciones: axe mide el contraste en un instante y una transición lo falsearía.
      reducedMotion: 'reduce',
    });

    test('las pantallas públicas no tienen problemas de accesibilidad', async ({ page }) => {
      for (const ruta of PUBLICAS) await revisar(page, ruta);
    });

    test('las pantallas del despacho no tienen problemas de accesibilidad', async ({ page }) => {
      test.setTimeout(180_000);
      await iniciarSesion(page, USUARIOS.administradora);
      for (const ruta of PRIVADAS) await revisar(page, ruta);

      // La ficha de un proceso y una consulta masiva con resultados.
      await page.goto('/procesos');
      await page.waitForLoadState('networkidle');
      const primero = page.getByRole('link', { name: /Ejecutivo|Restitución|Ordinario/ }).first();
      await primero.click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await revisarPaginaActual(page, 'ficha del proceso');
    });
  });
}
