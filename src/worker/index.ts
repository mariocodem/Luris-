/**
 * Proceso worker de LURIS (separado de Next.js).
 *
 * Ejecuta las colas de pg-boss: la sincronización de procesos con cada plataforma (con su límite
 * de concurrencia), la descarga de documentos, la sincronización programada, el despacho de
 * avisos (correo y WhatsApp) y la sesión de WhatsApp de cada despacho.
 */
import { obtenerDependencias, obtenerServiciosDelWorker } from '@/composition-root';
import {
  COLAS_DE_NOTIFICACIONES,
  asegurarColasDeNotificaciones,
} from '@/modules/notificaciones/infrastructure/cola-pg-boss';
import { NOMBRES_DE_COLA, asegurarColas } from '@/modules/plataformas/infrastructure/cola-pg-boss';
import { crearPgBoss } from '@/shared/infrastructure/cola/pg-boss';
import { crearManejadores } from './trabajos';

const ZONA_HORARIA = 'America/Bogota';
const ESPERA_DE_APAGADO_MS = 30_000;

async function iniciar(): Promise<void> {
  const { env, logger } = obtenerDependencias('worker');
  const boss = crearPgBoss({ urlBaseDeDatos: env.DATABASE_URL, rol: 'worker', logger });
  await boss.start();

  const servicios = obtenerServiciosDelWorker(boss);
  await asegurarColas(boss, servicios.colas);
  await asegurarColasDeNotificaciones(boss);
  const manejadores = crearManejadores(servicios, logger);

  for (const plataforma of servicios.colas.sincronizables) {
    await boss.work(
      NOMBRES_DE_COLA.sincronizar(plataforma),
      { localConcurrency: servicios.concurrencia.get(plataforma) ?? 1, pollingIntervalSeconds: 1 },
      async ([trabajo]) => (trabajo ? manejadores.sincronizar(trabajo) : undefined),
    );
  }
  for (const plataforma of servicios.colas.conDocumentos) {
    await boss.work(
      NOMBRES_DE_COLA.documentos(plataforma),
      { localConcurrency: 1, pollingIntervalSeconds: 5 },
      async ([trabajo]) => (trabajo ? manejadores.documentos(trabajo) : undefined),
    );
  }
  await boss.work(NOMBRES_DE_COLA.programada, async () => manejadores.programada());
  await boss.work(
    NOMBRES_DE_COLA.codigoDeAcceso,
    { pollingIntervalSeconds: 1 },
    async ([trabajo]) => (trabajo ? manejadores.codigoDeAcceso(trabajo) : undefined),
  );
  await boss.work(
    NOMBRES_DE_COLA.verificarCredencial,
    { pollingIntervalSeconds: 2 },
    async ([trabajo]) => (trabajo ? manejadores.verificarCredencial(trabajo) : undefined),
  );

  // Avisos de actuaciones nuevas (§9): se despachan cada minuto y cuando se programa uno.
  await boss.work(COLAS_DE_NOTIFICACIONES.despachar, { pollingIntervalSeconds: 2 }, async () =>
    manejadores.despacharNotificaciones(),
  );
  await boss.schedule(COLAS_DE_NOTIFICACIONES.despachar, '* * * * *', null, { tz: ZONA_HORARIA });
  await boss.work(
    COLAS_DE_NOTIFICACIONES.vincularWhatsapp,
    { pollingIntervalSeconds: 1 },
    async ([trabajo]) => (trabajo ? manejadores.vincularWhatsapp(trabajo) : undefined),
  );
  await boss.work(
    COLAS_DE_NOTIFICACIONES.desvincularWhatsapp,
    { pollingIntervalSeconds: 1 },
    async ([trabajo]) => (trabajo ? manejadores.desvincularWhatsapp(trabajo) : undefined),
  );
  // WhatsApp corre dentro de este proceso (sin contenedor aparte): reconecta las sesiones guardadas.
  await servicios.gestorDeWhatsapp?.iniciar();

  if (env.SINCRONIZACION_CRON === 'off') {
    await boss.unschedule(NOMBRES_DE_COLA.programada);
    logger.info('Sincronización programada desactivada');
  } else {
    await boss.schedule(NOMBRES_DE_COLA.programada, env.SINCRONIZACION_CRON, null, {
      tz: ZONA_HORARIA,
    });
    logger.info('Sincronización programada', { cron: env.SINCRONIZACION_CRON, zona: ZONA_HORARIA });
  }

  logger.info('Worker de LURIS iniciado', { entorno: env.NODE_ENV });

  let deteniendo = false;
  const detener = (senal: NodeJS.Signals): void => {
    if (deteniendo) return;
    deteniendo = true;
    logger.info('Deteniendo worker: se terminan los trabajos en curso', { senal });
    boss
      .stop({ graceful: true, timeout: ESPERA_DE_APAGADO_MS })
      // Cierra el navegador de SIUGJ y los ingresos que esperaban un código.
      .then(() => servicios.cerrarPlataformas())
      .catch((error: unknown) => logger.error('El worker no se detuvo limpio', { error }))
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', detener);
  process.once('SIGTERM', detener);
}

iniciar().catch((error: unknown) => {
  // Puede fallar antes de tener logger (p. ej. con la configuración inválida).
  console.error('El worker no pudo iniciar:', error);
  process.exit(1);
});
