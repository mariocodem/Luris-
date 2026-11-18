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
     * Cómo salen los correos (cuenta y avisos de actuaciones).
     * - archivo: solo desarrollo; cada correo se guarda como .html en CORREO_DIRECTORIO.
     * - smtp: servidor SMTP (SMTP_*); obligatorio en producción.
     */
    CORREO_TRANSPORTE: z.enum(['archivo', 'smtp']).default('archivo'),
    CORREO_DIRECTORIO: z.string().default('.correos'),
    CORREO_REMITENTE: z.string().default('LURIS <no-responder@luris.test>'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PUERTO: z.coerce.number().int().min(1).max(65535).default(587),
    /** TLS implícito (puerto 465). Si se omite, se usa solo con el puerto 465; en 587 se negocia STARTTLS. */
    SMTP_SEGURO: z.stringbool().optional(),
    SMTP_USUARIO: z.string().min(1).optional(),
    SMTP_CLAVE: z.string().min(1).optional(),

    // ─── Notificaciones (§9) ───────────────────────────────────────────────────
    /** Hora (0-23, Bogotá) a la que sale el resumen diario de actuaciones nuevas. */
    NOTIFICACIONES_HORA_RESUMEN: z.coerce.number().int().min(0).max(23).default(7),
    /**
     * Ritmo máximo de mensajes de WhatsApp por despacho. Bajo a propósito: la librería no es la API
     * oficial y un ritmo alto puede hacer que bloqueen el número.
     */
    WHATSAPP_MENSAJES_POR_MINUTO: z.coerce.number().int().min(1).max(30).default(6),

    // ─── Plataformas judiciales (§6) ───────────────────────────────────────────
    /** API de la Consulta de Procesos Nacional Unificada (Rama Judicial). */
    CPNU_URL_BASE: z
      .url({ protocol: /^https?$/ })
      .default('https://consultaprocesos.ramajudicial.gov.co:448/api/v2'),
    /**
     * Ritmo máximo de solicitudes a la CPNU (consultas y documentos del worker suman). Con ráfagas
     * de ~35 por minuto la CPNU empezó a responder 403 a los documentos: el valor por defecto
     * es conservador.
     */
    CPNU_SOLICITUDES_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(20),
    /** Minutos sin consultar la CPNU cuando frena a LURIS (403 o 429 persistente). */
    CPNU_PAUSA_POR_BLOQUEO_MINUTOS: z.coerce.number().int().min(1).max(240).default(10),
    /** Procesos que el worker consulta a la vez en la CPNU. */
    CPNU_CONCURRENCIA: z.coerce.number().int().min(1).max(20).default(2),
    /** Tiempo máximo de espera por solicitud a una plataforma (la CPNU puede ser lenta). */
    PLATAFORMAS_TIEMPO_LIMITE_SEGUNDOS: z.coerce.number().int().min(5).max(300).default(60),
    /** Reintentos inmediatos de una solicitud ante fallos pasajeros (después reintenta la cola). */
    PLATAFORMAS_REINTENTOS: z.coerce.number().int().min(0).max(5).default(2),
    /** User-Agent identificable de LURIS (§6). Si se omite, se arma con APP_URL. */
    PLATAFORMAS_USER_AGENT: z.string().min(5).max(200).optional(),
    /**
     * Cuándo se sincronizan solos todos los procesos activos: expresión cron de 5 campos en hora
     * de Bogotá, o "off" para desactivarla. Por defecto a las 6:00, 13:00 y 19:00.
     */
    SINCRONIZACION_CRON: z
      .string()
      .trim()
      .regex(
        /^(off|(\S+\s+){4}\S+)$/,
        'Usa una expresión cron de 5 campos (p. ej. "0 6,13,19 * * *") u "off".',
      )
      .default('0 6,13,19 * * *'),

    /** Portal «Consulta su denuncia» de la Fiscalía, para la consulta asistida del SPOA. */
    SPOA_URL_PORTAL: z
      .url({ protocol: /^https?$/ })
      .default('https://consulta-web.fiscalia.gov.co/'),
    /**
     * Servicio oficial de interoperabilidad del SPOA. Solo cuando la Fiscalía lo conceda (ver
     * docs/solicitudes): con URL y credencial, el SPOA se consulta solo; sin ellas, es asistido.
     */
    SPOA_INTEROPERABILIDAD_URL: z.url({ protocol: /^https$/ }).optional(),
    SPOA_INTEROPERABILIDAD_TOKEN: z.string().min(16).optional(),
    SPOA_SOLICITUDES_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(10),
    /** Días sin consultar el SPOA tras los cuales el proceso vuelve a la bandeja de pendientes. */
    SPOA_DIAS_ENTRE_CONFIRMACIONES: z.coerce.number().int().min(1).max(90).default(7),

    /** Búsqueda pública de SAMAI (jurisdicción de lo contencioso administrativo). */
    SAMAI_URL_BASE: z.url({ protocol: /^https?$/ }).default('https://samai.consejodeestado.gov.co'),
    SAMAI_SOLICITUDES_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(10),

    /** Portal de SIUGJ (usuarios externos, con la cuenta del abogado o del despacho). */
    SIUGJ_URL_BASE: z.url({ protocol: /^https?$/ }).default('https://siugj.ramajudicial.gov.co'),
    /**
     * Navegador con que el worker abre SIUGJ: «chromium» (el de Playwright, en Docker) o el
     * instalado en el equipo («msedge», «chrome»), útil en desarrollo.
     */
    SIUGJ_NAVEGADOR: z.enum(['chromium', 'msedge', 'chrome']).default('chromium'),
    /** Ritmo conservador: cada consulta abre varias páginas del portal. */
    SIUGJ_SOLICITUDES_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(6),
    /** Minutos que LURIS espera el código de acceso que SIUGJ envía a la persona. */
    SIUGJ_MINUTOS_PARA_CODIGO: z.coerce.number().int().min(2).max(60).default(10),

    // ─── Credenciales de plataformas (§4, §6) ──────────────────────────────────
    /**
     * Clave AES-256-GCM (32 bytes en base64) con la que se cifran las contraseñas de plataformas
     * que registran los abogados. Sin ella, LURIS no acepta credenciales. Si se pierde, las
     * guardadas no se pueden recuperar: hay que registrarlas de nuevo.
     */
    CREDENCIALES_CLAVE: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message:
          'Debe ser una clave de 32 bytes en base64 (genera una con `openssl rand -base64 32`).',
      })
      .optional(),

    // ─── Documentos (§8) ───────────────────────────────────────────────────────
    /** Carpeta de los documentos descargados (en Docker, el volumen de la app). */
    ALMACEN_DIRECTORIO: z.string().min(1).default('storage/documentos'),
    DOCUMENTO_TAMANO_MAXIMO_MB: z.coerce.number().int().min(1).max(200).default(25),
  })
  .refine(
    (env) =>
      (env.SPOA_INTEROPERABILIDAD_URL === undefined) ===
      (env.SPOA_INTEROPERABILIDAD_TOKEN === undefined),
    {
      path: ['SPOA_INTEROPERABILIDAD_TOKEN'],
      message:
        'El servicio oficial del SPOA necesita a la vez la URL y la credencial (o ninguna de las dos).',
    },
  )
  .refine((env) => env.CORREO_TRANSPORTE !== 'smtp' || env.SMTP_HOST !== undefined, {
    path: ['SMTP_HOST'],
    message: 'Con CORREO_TRANSPORTE=smtp hay que indicar el servidor (SMTP_HOST).',
  })
  .refine((env) => (env.SMTP_USUARIO === undefined) === (env.SMTP_CLAVE === undefined), {
    path: ['SMTP_CLAVE'],
    message: 'El usuario y la clave del SMTP van juntos (o ninguno de los dos).',
  })
  // El transporte "archivo" guardaría en disco correos con enlaces de acceso.
  .refine((env) => env.NODE_ENV !== 'production' || env.CORREO_TRANSPORTE !== 'archivo', {
    path: ['CORREO_TRANSPORTE'],
    message:
      'El transporte "archivo" es solo para desarrollo: guardaría enlaces de acceso en disco. Configura CORREO_TRANSPORTE=smtp y SMTP_HOST.',
  })
  .transform((env) => ({
    ...env,
    LOG_FORMAT: env.LOG_FORMAT ?? (env.NODE_ENV === 'development' ? 'pretty' : 'json'),
    PLATAFORMAS_USER_AGENT:
      env.PLATAFORMAS_USER_AGENT ??
      `LURIS/0.1 (seguimiento de procesos judiciales; +${env.APP_URL})`,
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
