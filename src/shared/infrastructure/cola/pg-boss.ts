import { PgBoss } from 'pg-boss';
import type { Logger } from '@/shared/domain/logger';

/**
 * Cola de trabajos sobre PostgreSQL (pg-boss): sin Redis, para respetar los dos contenedores
 * (§2). Guarda sus tablas en el esquema `pgboss` de la misma base de datos.
 *
 * - El worker ejecuta los trabajos, la supervisión y las tareas programadas.
 * - La web solo encola y consulta el estado de los trabajos.
 */
export type RolDeCola = 'web' | 'worker';

export function crearPgBoss(opciones: {
  readonly urlBaseDeDatos: string;
  readonly rol: RolDeCola;
  readonly logger: Logger;
}): PgBoss {
  const esWorker = opciones.rol === 'worker';
  const boss = new PgBoss({
    connectionString: opciones.urlBaseDeDatos,
    application_name: `luris-${opciones.rol}`,
    max: esWorker ? 10 : 3,
    connectionTimeoutMillis: 5_000,
    supervise: esWorker,
    schedule: esWorker,
  });
  const logger = opciones.logger.child({ componente: 'cola' });
  boss.on('error', (error) => logger.error('Error de la cola de trabajos', { error }));
  boss.on('warning', (aviso) => logger.warn('Aviso de la cola de trabajos', { aviso }));
  return boss;
}

const globalParaCola = globalThis as typeof globalThis & { __lurisColaWeb?: Promise<PgBoss> };

/**
 * Instancia de la web, iniciada la primera vez que se usa y compartida por proceso (en
 * `globalThis`, para que la recarga en caliente no abra conexiones nuevas). Si no logra
 * iniciar, el siguiente intento vuelve a probar.
 */
export function obtenerColaDeLaWeb(
  crear: () => PgBoss,
  preparar: (boss: PgBoss) => Promise<void>,
): Promise<PgBoss> {
  globalParaCola.__lurisColaWeb ??= (async () => {
    const boss = crear();
    try {
      await boss.start();
      await preparar(boss);
      return boss;
    } catch (error) {
      globalParaCola.__lurisColaWeb = undefined;
      await boss.stop({ graceful: false }).catch(() => undefined);
      throw error;
    }
  })();
  return globalParaCola.__lurisColaWeb;
}
