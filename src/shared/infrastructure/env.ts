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
    BETTER_AUTH_SECRET: z
      .string({ error: 'Falta el secreto de sesiones (genera uno con `openssl rand -base64 32`).' })
      .min(32, 'Debe tener al menos 32 caracteres (genera uno con `openssl rand -base64 32`).'),
    INVITACION_HORAS_VIGENCIA: z.coerce.number().int().min(1).max(720).default(72),
    RECUPERACION_MINUTOS_VIGENCIA: z.coerce.number().int().min(5).max(1440).default(60),
    /**
     * Cómo salen los correos de cuenta (invitaciones, recuperación de contraseña).
     * - archivo: solo desarrollo; cada correo se guarda como .html en CORREO_DIRECTORIO.
     * El adaptador SMTP llega en la Fase 11.
     */
    CORREO_TRANSPORTE: z.enum(['archivo']).default('archivo'),
    CORREO_DIRECTORIO: z.string().default('.correos'),
    CORREO_REMITENTE: z.string().default('LURIS <no-responder@luris.test>'),
  })
  // Hoy "archivo" es el único transporte: en producción no hay uno válido hasta la Fase 11.
  .refine((env) => env.NODE_ENV !== 'production', {
    path: ['CORREO_TRANSPORTE'],
    message:
      'El transporte "archivo" es solo para desarrollo: guardaría enlaces de acceso en disco. Configura SMTP (Fase 11).',
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
