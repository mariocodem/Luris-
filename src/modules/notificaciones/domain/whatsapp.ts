/**
 * WhatsApp del despacho (§9): un número dedicado, vinculado por QR desde Ajustes por el
 * administrador. LURIS usa una librería de código abierto (no la API oficial de Meta).
 */

/** Se muestran SIEMPRE junto a la vinculación y a las preferencias de WhatsApp. */
export const ADVERTENCIAS_DE_WHATSAPP: readonly string[] = [
  'Esta conexión no es la API oficial de WhatsApp (Meta). Puede incumplir los términos de uso de WhatsApp y el número puede ser bloqueado.',
  'Usa un número dedicado a LURIS, no el personal ni el principal del despacho.',
  'LURIS envía pocos mensajes y despacio, y solo a quienes aceptaron recibirlos.',
  'Mantén el teléfono con ese número con conexión de vez en cuando: si WhatsApp cierra la sesión, tendrás que vincular de nuevo.',
];

/** Contexto de cifrado de las credenciales y claves de la sesión (solo sirven para ese despacho). */
export function contextoDeSesionWhatsapp(despachoId: string): string {
  return ['luris-whatsapp-sesion-v1', despachoId].join('|');
}

/** Contexto de cifrado del QR: quien lo escanee vincula su WhatsApp, así que no queda en claro. */
export function contextoDeQrWhatsapp(despachoId: string): string {
  return ['luris-whatsapp-qr-v1', despachoId].join('|');
}

/** Un QR de WhatsApp se renueva cada ~20 s; uno más viejo que esto ya no sirve. */
export const SEGUNDOS_DE_VIGENCIA_DEL_QR = 90;

/** Segundos que se espera al servicio de segundo plano antes de decir que no responde. */
export const SEGUNDOS_PARA_QUE_RESPONDA_EL_WORKER = 45;

/** JID de WhatsApp de un número en formato internacional. */
export function jidDeNumero(numero: string): string {
  return `${numero.replace(/\D/g, '')}@s.whatsapp.net`;
}

/** Número (solo dígitos) de un JID de Baileys: «573001234567:12@s.whatsapp.net» → «573001234567». */
export function numeroDeJid(jid: string): string | null {
  const numero = /^(\d{6,15})(?::\d+)?@/.exec(jid)?.[1];
  return numero ?? null;
}
