import pino, { type Logger as PinoLogger } from 'pino';
import pretty from 'pino-pretty';
import type { ContextoLog, Logger } from '@/shared/domain/logger';

/**
 * Claves que nunca deben aparecer en los logs (credenciales, tokens, secretos).
 * Se ocultan tanto en el primer nivel como un nivel por debajo.
 */
const CLAVES_SENSIBLES = [
  'password',
  'contrasena',
  'clave',
  'secreto',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'credencial',
  'credenciales',
];

const RUTAS_OCULTAS = CLAVES_SENSIBLES.flatMap((clave) => [clave, `*.${clave}`]);

export interface OpcionesLogger {
  readonly nivel: pino.LevelWithSilent;
  readonly formato: 'json' | 'pretty';
  readonly servicio: 'web' | 'worker' | 'cli';
}

export function crearLoggerPino(opciones: OpcionesLogger): Logger {
  const base = pino(
    {
      level: opciones.nivel,
      base: { app: 'luris', servicio: opciones.servicio },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: RUTAS_OCULTAS, censor: '[oculto]' },
      serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
      // En JSON el nivel va como texto ("info") para que lo lean las herramientas de logs.
      ...(opciones.formato === 'json' && {
        formatters: { level: (etiqueta: string) => ({ level: etiqueta }) },
      }),
    },
    // pino-pretty como stream en el mismo proceso: evita los worker threads de los
    // transports de pino, que no funcionan bien dentro del bundle de Next.js.
    opciones.formato === 'pretty'
      ? pretty({ colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' })
      : undefined,
  );
  return adaptar(base);
}

function adaptar(pinoLogger: PinoLogger): Logger {
  return {
    debug: (mensaje, contexto) => pinoLogger.debug(contexto ?? {}, mensaje),
    info: (mensaje, contexto) => pinoLogger.info(contexto ?? {}, mensaje),
    warn: (mensaje, contexto) => pinoLogger.warn(contexto ?? {}, mensaje),
    error: (mensaje, contexto) => pinoLogger.error(contexto ?? {}, mensaje),
    child: (contexto: ContextoLog) => adaptar(pinoLogger.child(contexto)),
  };
}
