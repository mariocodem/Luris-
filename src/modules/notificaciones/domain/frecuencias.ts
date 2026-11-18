/**
 * Frecuencias, textos y formato de número de las preferencias, sin Zod: los componentes de la
 * interfaz importan este archivo y no deben arrastrar el validador al navegador.
 */

/** Cuándo recibe la persona los avisos de actuaciones nuevas. */
export const FRECUENCIAS = ['INMEDIATA', 'RESUMEN_DIARIO'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const NOMBRE_DE_FRECUENCIA: Readonly<Record<Frecuencia, string>> = {
  INMEDIATA: 'De inmediato, apenas la plataforma registre la actuación',
  RESUMEN_DIARIO: 'En un resumen diario',
};

/** Lo que la persona acepta al activar WhatsApp (§9: solo a quien dio su consentimiento). */
export const TEXTO_DE_CONSENTIMIENTO_WHATSAPP =
  'Acepto que LURIS me escriba por WhatsApp a este número para avisarme de actuaciones nuevas en mis procesos. Puedo desactivarlo cuando quiera.';

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
