/**
 * Crea el primer superadministrador si se pidió con `SUPERADMIN_EMAIL`, `SUPERADMIN_CONTRASENA`
 * (y, opcionalmente, `SUPERADMIN_NOMBRE`). Lo ejecuta el entrypoint del contenedor en cada
 * arranque; es idempotente. Después del primer arranque conviene quitar la contraseña del `.env`.
 */
import { obtenerBetterAuth, obtenerDependencias } from '@/composition-root';
import { crearPrimerSuperadmin } from './superadmin';

const { env, logger, baseDeDatos } = obtenerDependencias('cli');

try {
  const contexto = await obtenerBetterAuth().$context;
  const resultado = await crearPrimerSuperadmin({
    prisma: baseDeDatos.sinAislamiento,
    hashear: (contrasena) => contexto.password.hash(contrasena),
    email: env.SUPERADMIN_EMAIL?.trim().toLowerCase(),
    nombre: env.SUPERADMIN_NOMBRE?.trim(),
    contrasena: env.SUPERADMIN_CONTRASENA,
  });
  switch (resultado.tipo) {
    case 'CREADO':
      logger.info('Superadministrador creado. Quita SUPERADMIN_CONTRASENA del .env.');
      break;
    case 'YA_EXISTE':
      break;
    case 'SIN_DATOS':
      logger.warn(
        'No hay superadministrador. Define SUPERADMIN_EMAIL y SUPERADMIN_CONTRASENA y reinicia para crearlo.',
      );
      break;
    case 'INVALIDO':
      logger.error('No se creó el superadministrador: revisa estas variables.', {
        problemas: resultado.problemas,
      });
      process.exitCode = 1;
      break;
  }
} finally {
  await baseDeDatos.sinAislamiento.$disconnect();
}
