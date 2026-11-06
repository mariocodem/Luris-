/**
 * Código de ayuda: identificador corto que sí puede mostrarse al usuario
 * ("Código de ayuda: A7F3K2") y que permite encontrar el detalle técnico en los logs.
 *
 * Usa el alfabeto Crockford Base32, sin caracteres ambiguos (I, L, O, U).
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LONGITUD_CODIGO_DE_AYUDA = 6;

/** Genera un código de ayuda aleatorio para correlacionar un error con sus logs. */
export function generarCodigoDeAyuda(): string {
  const bytes = new Uint8Array(LONGITUD_CODIGO_DE_AYUDA);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('');
}

/**
 * Deriva un código de ayuda estable a partir de otro identificador (p. ej. el `digest`
 * que Next.js asigna a un error del servidor). El servidor y el navegador obtienen el
 * mismo código sin compartir nada más que el identificador original.
 */
export function codigoDeAyudaDesde(identificador: string): string {
  // FNV-1a de 32 bits: rápido, determinista y suficiente para correlación (no es seguridad).
  let hash = 0x811c9dc5;
  for (let i = 0; i < identificador.length; i++) {
    hash ^= identificador.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 6 caracteres × 5 bits = 30 bits del hash.
  let codigo = '';
  for (let i = 0; i < LONGITUD_CODIGO_DE_AYUDA; i++) {
    codigo += ALFABETO[(hash >>> (i * 5)) & 0b11111];
  }
  return codigo;
}
