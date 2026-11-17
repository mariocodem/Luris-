import { expect, test, type Locator } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Flujo principal de la gestión de procesos (Fase 4): registrar, ver, editar, archivar y
 * restaurar, con permisos verificados por rol, búsqueda, asignaciones e importación.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Next.js conserva ocultas las páginas anteriores (React <Activity>) para volver atrás al
 * instante: los textos se buscan solo entre lo visible.
 */
const visible = (localizador: Locator) => localizador.filter({ visible: true });

const RADICADO_CON_GUIONES = '11001-31-03-005-2025-00777-00';
const RADICADO = '11001310300520250077700';
let urlDelProceso = '';

test('una abogada registra, edita, archiva y restaura un proceso', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await page.getByRole('link', { name: 'Procesos' }).first().click();
  await page.getByRole('link', { name: 'Registrar proceso' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Registrar proceso' })).toBeVisible();

  // Validación en tiempo real, con el mensaje del dominio.
  const radicado = page.getByRole('textbox', { name: /^Radicado/ });
  await radicado.fill('11001-31-03-005');
  await radicado.blur();
  await expect(
    visible(page.getByText('El radicado debe tener 23 números; este tiene 12.')),
  ).toBeVisible();
  await radicado.fill(RADICADO_CON_GUIONES);
  await expect(visible(page.getByText(`Se guardará como ${RADICADO}`))).toBeVisible();

  await page.getByRole('textbox', { name: 'Alias', exact: true }).fill('Pertenencia E2E');
  await page.getByRole('textbox', { name: 'Cliente o parte' }).fill('Comunidad Los Álamos');
  await page.getByRole('textbox', { name: 'Agregar otras etiquetas' }).fill('Prueba E2E');
  await page.getByRole('button', { name: 'Registrar proceso' }).click();

  // La ficha: radicado sin guiones con su botón de copiar, y la abogada como responsable.
  await expect(page.getByRole('heading', { level: 1, name: 'Pertenencia E2E' })).toBeVisible();
  await expect(visible(page.getByText('Proceso registrado.'))).toBeVisible();
  await expect(visible(page.getByText(RADICADO, { exact: true }))).toBeVisible();
  await expect(page.getByRole('button', { name: `Copiar radicado ${RADICADO}` })).toBeVisible();
  const datos = visible(page.getByRole('complementary', { name: 'Datos del proceso' }));
  await expect(datos.getByText('Mariana Ortiz', { exact: true })).toBeVisible();
  await expect(visible(page.getByText('Prueba E2E', { exact: true }))).toBeVisible();
  await expect(visible(page.getByText('Aún no hay actuaciones'))).toBeVisible();
  urlDelProceso = new URL(page.url()).pathname;

  // Editar.
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByRole('textbox', { name: 'Alias', exact: true }).fill('Pertenencia E2E (editado)');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pertenencia E2E (editado)' }),
  ).toBeVisible();
  await expect(visible(page.getByText('Cambios guardados.'))).toBeVisible();

  // Archivar: sale de los activos y aparece en archivados.
  await page.getByRole('button', { name: 'Archivar proceso' }).click();
  await expect(page.getByRole('button', { name: 'Restaurar proceso' })).toBeVisible();
  await page.goto('/procesos');
  await expect(page.getByRole('link', { name: 'Pertenencia E2E (editado)' })).toHaveCount(0);
  await page.goto('/procesos?estado=archivados');
  await page.getByRole('link', { name: 'Pertenencia E2E (editado)' }).first().click();

  // Restaurar.
  await page.getByRole('button', { name: 'Restaurar proceso' }).click();
  await expect(page.getByRole('button', { name: 'Archivar proceso' })).toBeVisible();
});

test('un radicado repetido se rechaza con un mensaje claro', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.abogada);
  await page.goto('/procesos/nuevo');
  await page.getByRole('textbox', { name: /^Radicado/ }).fill(RADICADO);
  await page.getByRole('button', { name: 'Registrar proceso' }).click();
  await expect(
    visible(page.getByRole('alert')).filter({ hasText: 'Ya hay un proceso' }),
  ).toContainText(`Ya hay un proceso con el radicado ${RADICADO}`);
});

test('una asistente no ve los procesos que no le asignaron', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.asistente);
  await page.goto(urlDelProceso);
  await expect(page.getByRole('heading', { name: 'No encontramos ese proceso' })).toBeVisible();

  await page.goto('/procesos?q=Pertenencia');
  await expect(visible(page.getByText('Ningún proceso coincide'))).toBeVisible();
  // Sí ve los suyos.
  await page.goto('/procesos');
  await expect(page.getByRole('link', { name: 'Denuncia por estafa' }).first()).toBeVisible();
});

test('la administradora busca sin tildes y asigna apoyo', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/procesos');
  await page.getByRole('searchbox', { name: /Buscar por radicado/ }).fill('maria fernanda');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/q=maria/);
  await page.getByRole('link', { name: 'Nulidad y restablecimiento del derecho' }).first().click();

  await page
    .getByRole('combobox', { name: 'Elegir persona para asignar' })
    .selectOption({ label: 'Paula Méndez · Asistente' });
  await page.getByRole('button', { name: 'Asignar' }).click();
  await expect(visible(page.getByText('Persona asignada al proceso.'))).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Quitar a Paula Méndez del proceso' }),
  ).toBeVisible();
});

test('importa procesos desde un CSV con vista previa', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.administradora);
  await page.goto('/procesos/importar');
  await page.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'lote.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Radicado;Alias;Cliente',
        '11001-31-03-009-2025-00001-00;Lote uno;Cliente Uno',
        '11001310300920250000100;Repetido;',
        '123;Malo;',
        '11001-31-03-001-2023-00123-00;Ya existe;',
      ].join('\n'),
    ),
  });
  await page.getByRole('button', { name: 'Revisar archivo' }).click();

  await expect(page.getByRole('heading', { name: 'Revisa antes de importar' })).toBeVisible();
  await expect(visible(page.getByText('Repetido: ya aparece en la fila 2.'))).toBeVisible();
  await expect(
    visible(page.getByText('El radicado debe tener 23 números; este tiene 3.')),
  ).toBeVisible();
  await expect(visible(page.getByText('ya registrados (se omiten)'))).toBeVisible();

  await page.getByRole('button', { name: 'Importar 1 proceso' }).click();
  await expect(page.getByRole('heading', { name: 'Importamos 1 proceso' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver procesos' }).click();
  await expect(page.getByRole('link', { name: 'Lote uno' }).first()).toBeVisible();
});

test.describe('en el celular', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('la lista se muestra como tarjetas, sin tabla', async ({ page }) => {
    await iniciarSesion(page, USUARIOS.administradora);
    await page.goto('/procesos');
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('list', { name: 'Procesos' })).toBeVisible();
  });

  test('ninguna pantalla de procesos se desborda a lo ancho', async ({ page }) => {
    await iniciarSesion(page, USUARIOS.administradora);
    await page.goto('/procesos?q=restitucion');
    await visible(page.getByRole('link', { name: 'Restitución de inmueble arrendado' })).click();
    await expect(page).toHaveURL(/\/procesos\/[0-9a-f-]{36}$/);
    const ficha = new URL(page.url()).pathname;

    for (const ruta of [
      '/procesos',
      ficha,
      `${ficha}/editar`,
      '/procesos/nuevo',
      '/procesos/importar',
    ]) {
      await page.goto(ruta);
      await expect(visible(page.getByRole('heading', { level: 1 }))).toBeVisible();
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desborde, `desborde horizontal en ${ruta}`).toBeLessThanOrEqual(0);
    }
  });
});
