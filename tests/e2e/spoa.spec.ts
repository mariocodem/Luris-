import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { iniciarSesion, USUARIOS } from './apoyo';

/**
 * Consulta asistida del SPOA (Fase 6): el proceso con NUNC de la semilla está en la bandeja
 * «Pendientes de tu confirmación»; el abogado consulta en el portal (simulado en las pruebas),
 * pega el resultado, revisa lo que LURIS leyó y lo guarda. El resultado queda en la ficha con las
 * fechas oficiales y sale de la bandeja.
 */
test.describe.configure({ mode: 'serial' });

const visible = (localizador: Locator) => localizador.filter({ visible: true });

const PROCESO = 'Denuncia por estafa';
const NUNC = '110016000049202300123';
const RESULTADO = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/spoa/resultado-copiado.txt'),
  'utf8',
);

test('un abogado consulta un NUNC en el SPOA desde la bandeja y el resultado queda guardado', async ({
  page,
}) => {
  await iniciarSesion(page, USUARIOS.abogado);
  await page.goto('/pendientes');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pendientes de tu confirmación' }),
  ).toBeVisible();
  const pendiente = visible(page.getByRole('listitem').filter({ hasText: PROCESO }));
  await expect(pendiente).toContainText('aún sin consultar');
  await pendiente.getByRole('link', { name: /Consultar en SPOA/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Consultar en el SPOA' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Copiar NUNC ${NUNC}` })).toBeVisible();
  // El portal se muestra para que la persona resuelva el reto ella misma.
  const portal = page.frameLocator('iframe[title="Portal «Consulta su denuncia» de la Fiscalía"]');
  await expect(portal.getByText('Portal simulado de la Fiscalía (pruebas)')).toBeVisible();

  const campo = page.getByRole('textbox', { name: 'Resultado copiado del portal' });

  // Un texto que no es el resultado: se explica cómo copiarlo, sin guardar nada.
  await campo.fill('Hola, esto no es el resultado');
  await page.getByRole('button', { name: 'Leer resultado' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'selecciona todo' })).toBeVisible();

  await campo.fill(RESULTADO);
  await page.getByRole('button', { name: 'Leer resultado' }).click();
  const vista = page.getByRole('region', { name: 'Esto es lo que leímos' });
  await expect(vista).toContainText('3 actuaciones: se guardarán como la historia del proceso.');
  await expect(vista).toContainText('FISCALÍA 123 LOCAL');
  await expect(vista.locator('time').first()).toHaveText('10/05/2023');

  await page.getByRole('button', { name: 'Guardar en LURIS' }).click();
  await expect(page.getByText('Trajimos 3 actuaciones del SPOA de la Fiscalía.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: PROCESO })).toBeVisible();

  // En la ficha: los datos del SPOA y sus actuaciones con la fecha oficial.
  await expect(
    visible(page.getByRole('heading', { name: 'Según el SPOA de la Fiscalía' })),
  ).toBeVisible();
  await expect(visible(page.getByText('INDAGACION'))).toBeVisible();
  const asignacion = visible(page.getByRole('listitem').filter({ hasText: 'ASIGNACION' }));
  await expect(asignacion.locator('time').first()).toHaveText('10/05/2023');
  // El SPOA no informa fecha de registro: se dice, no se inventa.
  await expect(asignacion).toContainText('La plataforma no informó la fecha de registro');

  // Sale de la bandeja.
  await page.goto('/pendientes');
  await expect(visible(page.getByText('No tienes consultas pendientes'))).toBeVisible();
});

test('volver a guardar la misma consulta no duplica actuaciones', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.abogado);
  await page.goto('/procesos');
  await visible(page.getByRole('link', { name: PROCESO }))
    .first()
    .click();
  await page.getByRole('link', { name: 'Consultar en el SPOA' }).click();
  await page.getByRole('textbox', { name: 'Resultado copiado del portal' }).fill(RESULTADO);
  await page.getByRole('button', { name: 'Leer resultado' }).click();
  await expect(page.getByRole('region', { name: 'Esto es lo que leímos' })).toContainText(
    '3 actuaciones, ninguna nueva.',
  );
  await page.getByRole('button', { name: 'Guardar en LURIS' }).click();
  await expect(page.getByText('Sin actuaciones nuevas en el SPOA de la Fiscalía.')).toBeVisible();
  await expect(visible(page.getByText('3 actuaciones', { exact: true }))).toBeVisible();
});
