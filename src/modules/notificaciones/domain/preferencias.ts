import { z } from 'zod';

/** Cuándo recibe la persona los avisos de actuaciones nuevas. */
export const FRECUENCIAS = ['INMEDIATA', 'RESUMEN_DIARIO'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const NOMBRE_DE_FRECUENCIA: Readonly<Record<Frecuencia, string>> = {
  INMEDIATA: 'De inmediato, apenas la plataforma registre la actuación',
  RESUMEN_DIARIO: 'En un resumen diario',
};

export interface PreferenciasDeNotificacion {
  readonly correoActivo: boolean;
  readonly whatsappActivo: boolean;
  /** Solo dígitos, formato internacional (p. ej. 573001234567). */
  readonly numeroWhatsapp: string | null;
  /** Cuándo aceptó recibir avisos por WhatsApp. Sin esto, WhatsApp no se activa. */
  readonly consentimientoWhatsappEn: Date | null;
  readonly frecuencia: Frecuencia;
}

/** Sin preferencias guardadas: correo de inmediato (WhatsApp exige consentimiento expreso). */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasDeNotificacion = {
  correoActivo: true,
  whatsappActivo: false,
  numeroWhatsapp: null,
  consentimientoWhatsappEn: null,
  frecuencia: 'INMEDIATA',
};

/** Lo que la persona acepta al activar WhatsApp (§9: solo a quien dio su consentimiento). */
export const TEXTO_DE_CONSENTIMIENTO_WHATSAPP =
  'Acepto que LURIS me escriba por WhatsApp a este número para avisarme de actuaciones nuevas en mis procesos. Puedo desactivarlo cuando quiera.';

const MENSAJE_DE_NUMERO =
  'Escribe un número de celular válido, con indicativo de país si no es colombiano (p. ej. 300 123 4567 o +57 300 123 4567).';

/**
 * Normaliza un número de WhatsApp a dígitos en formato internacional. Un celular colombiano de 10
 * números que empieza por 3 recibe el indicativo 57. Devuelve null si no parece un número válido.
 */
export function normalizarNumeroWhatsapp(texto: string): string | null {
  const digitos = texto.replace(/\D/g, '').replace(/^00/, '');
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^57\d{10}$/.test(digitos)) return /^573\d{9}$/.test(digitos) ? digitos : null;
  return /^[1-9]\d{9,14}$/.test(digitos) ? digitos : null;
}

/** Cómo se muestra un número guardado (+57 300 123 4567 para los colombianos). */
export function formatearNumeroWhatsapp(numero: string): string {
  const colombiano = /^57(3\d{2})(\d{3})(\d{4})$/.exec(numero);
  return colombiano ? `+57 ${colombiano[1]} ${colombiano[2]} ${colombiano[3]}` : `+${numero}`;
}

/** Esquema del formulario de preferencias, con los errores junto a cada campo (§10). */
export const esquemaDePreferencias = z
  .object({
    correoActivo: z.boolean(),
    whatsappActivo: z.boolean(),
    numeroWhatsapp: z.string().default(''),
    consentimientoWhatsapp: z.boolean(),
    frecuencia: z.enum(FRECUENCIAS, { error: 'Elige cada cuánto quieres recibir los avisos.' }),
  })
  .superRefine((datos, ctx) => {
    const numero = datos.numeroWhatsapp.trim();
    if (numero !== '' && normalizarNumeroWhatsapp(numero) === null) {
      ctx.addIssue({ code: 'custom', path: ['numeroWhatsapp'], message: MENSAJE_DE_NUMERO });
    }
    if (datos.whatsappActivo) {
      if (numero === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['numeroWhatsapp'],
          message: 'Escribe tu número de WhatsApp para recibir los avisos.',
        });
      }
      if (!datos.consentimientoWhatsapp) {
        ctx.addIssue({
          code: 'custom',
          path: ['consentimientoWhatsapp'],
          message: 'Para recibir avisos por WhatsApp debes aceptar que LURIS te escriba.',
        });
      }
    }
  });

export type EntradaDePreferencias = z.infer<typeof esquemaDePreferencias>;

/**
 * Preferencias que se guardan a partir de lo que llenó la persona. El consentimiento conserva su
 * fecha original mientras siga activo con el mismo número; al desactivar WhatsApp se retira.
 */
export function aplicarPreferencias(
  entrada: EntradaDePreferencias,
  previas: PreferenciasDeNotificacion,
  ahora: Date,
): PreferenciasDeNotificacion {
  const numero = normalizarNumeroWhatsapp(entrada.numeroWhatsapp);
  const consintio = entrada.whatsappActivo && entrada.consentimientoWhatsapp && numero !== null;
  const mismoNumero = numero !== null && numero === previas.numeroWhatsapp;
  return {
    correoActivo: entrada.correoActivo,
    whatsappActivo: consintio,
    numeroWhatsapp: numero,
    consentimientoWhatsappEn: consintio
      ? mismoNumero && previas.consentimientoWhatsappEn
        ? previas.consentimientoWhatsappEn
        : ahora
      : null,
    frecuencia: entrada.frecuencia,
  };
}
