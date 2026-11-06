/**
 * Proceso worker de LURIS (separado de Next.js).
 *
 * Aquí vivirán las colas de pg-boss (Fase 5), las tareas programadas y la sesión de
 * WhatsApp (Fase 11). Por ahora solo valida la configuración y gestiona el apagado.
 */
import { obtenerDependencias } from '@/composition-root';

const INTERVALO_LATIDO_MS = 60_000;

function iniciar(): void {
  const { env, logger } = obtenerDependencias('worker');
  logger.info('Worker de LURIS iniciado', { entorno: env.NODE_ENV });

  // Mantiene vivo el proceso hasta que existan colas registradas.
  const latido = setInterval(() => logger.debug('Worker activo'), INTERVALO_LATIDO_MS);

  const detener = (senal: NodeJS.Signals): void => {
    logger.info('Deteniendo worker', { senal });
    clearInterval(latido);
    process.exit(0);
  };
  process.once('SIGINT', detener);
  process.once('SIGTERM', detener);
}

iniciar();
