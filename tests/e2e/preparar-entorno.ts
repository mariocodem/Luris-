import { rmSync } from 'node:fs';
import {
  cargarEntorno,
  ejecutarPrisma,
  recrearBaseDeDatos,
  urlDePruebas,
} from '../apoyo/base-de-datos';

/**
 * Prepara la base de las pruebas e2e antes de arrancar el servidor (lo ejecuta el `webServer`
 * de playwright.config.ts): base `<DATABASE_URL>_e2e` vacía, todas las migraciones y la semilla
 * de desarrollo (usuarios por rol con la contraseña de desarrollo).
 */
cargarEntorno();
const url = urlDePruebas('_e2e', process.env.E2E_DATABASE_URL);
await recrearBaseDeDatos(url, '_e2e');
ejecutarPrisma(url, ['migrate', 'deploy'], 'Las migraciones no aplicaron sobre la base e2e');
ejecutarPrisma(url, ['db', 'seed'], 'La semilla no se pudo aplicar en la base e2e');
// Los correos de la ejecución anterior no deben confundir a las pruebas de avisos.
if (process.env.CORREO_DIRECTORIO) {
  rmSync(process.env.CORREO_DIRECTORIO, { recursive: true, force: true });
}
console.log(`Base e2e lista: ${url.pathname.slice(1)}`);
