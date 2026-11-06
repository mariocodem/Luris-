import { z } from 'zod';
import { err, ok, type Result } from '@/shared/domain/result';

/**
 * Variables de entorno del servidor, validadas con Zod.
 * Agrega aquí cada variable nueva y documéntala en `.env.example`.
 */
const esquemaEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: 'Debe ser una URL de PostgreSQL (postgresql://usuario:clave@host:puerto/base).',
    }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  })
  .transform((env) => ({
    ...env,
    LOG_FORMAT: env.LOG_FORMAT ?? (env.NODE_ENV === 'development' ? 'pretty' : 'json'),
  }));

export type Env = z.infer<typeof esquemaEnv>;

export interface ErrorDeConfiguracion {
  /** Variables con problema y la razón, sin incluir sus valores (pueden ser secretos). */
  readonly problemas: readonly string[];
}

/** Valida un conjunto de variables. Función pura: no lee `process.env` directamente. */
export function parsearEnv(
  fuente: Readonly<Record<string, string | undefined>>,
): Result<Env, ErrorDeConfiguracion> {
  // Una variable definida pero vacía (`CLAVE=`) se trata como ausente.
  const limpia = Object.fromEntries(Object.entries(fuente).filter(([, valor]) => valor !== ''));
  const resultado = esquemaEnv.safeParse(limpia);
  if (resultado.success) return ok(resultado.data);
  return err({
    problemas: resultado.error.issues.map(
      (issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`,
    ),
  });
}

let envEnCache: Env | undefined;

/**
 * Devuelve las variables de entorno validadas. Se evalúa de forma perezosa para no exigir
 * variables de ejecución durante `next build`. Si la configuración es inválida, el proceso
 * no debe arrancar: es un fallo de despliegue, no un error esperable.
 */
export function obtenerEnv(): Env {
  if (envEnCache) return envEnCache;
  const resultado = parsearEnv(process.env);
  if (!resultado.ok) {
    throw new Error(
      `Configuración inválida. Revisa tu archivo .env (ver .env.example):\n  - ${resultado.error.problemas.join('\n  - ')}`,
    );
  }
  envEnCache = resultado.value;
  return envEnCache;
}
