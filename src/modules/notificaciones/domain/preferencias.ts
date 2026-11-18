import { z } from 'zod';

import { FRECUENCIAS, normalizarNumeroWhatsapp, type Frecuencia } from './frecuencias';

export {
  FRECUENCIAS,
  NOMBRE_DE_FRECUENCIA,
  TEXTO_DE_CONSENTIMIENTO_WHATSAPP,
  formatearNumeroWhatsapp,
  normalizarNumeroWhatsapp,
  type Frecuencia,
} from './frecuencias';

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

const MENSAJE_DE_NUMERO =
  'Escribe un número de celular válido, con indicativo de país si no es colombiano (p. ej. 300 123 4567 o +57 300 123 4567).';

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
