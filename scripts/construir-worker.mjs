/**
 * Empaqueta el worker y el script del primer superadministrador en `dist/` (Fase 13, Docker).
 *
 * Todo el código de LURIS entra en el paquete (con sus alias `@/…`), y las dependencias de
 * `node_modules` quedan como externas: en la imagen están instaladas (solo las de producción).
 * Así el contenedor no necesita `tsx` ni el código fuente.
 */
import { build } from 'esbuild';

await build({
  entryPoints: {
    worker: 'src/worker/index.ts',
    'crear-superadmin': 'src/worker/crear-superadmin.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  packages: 'external',
  tsconfig: 'tsconfig.json',
  jsx: 'automatic',
  outExtension: { '.js': '.mjs' },
  logLevel: 'info',
});
