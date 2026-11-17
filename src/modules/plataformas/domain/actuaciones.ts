import type { FechaOficial } from '@/shared/domain/fechas';
import type { ActuacionExterna } from './consulta';

/** Largo máximo de la clave de deduplicación (columna de 100 caracteres). */
const LARGO_MAXIMO_DE_CLAVE = 100;

/**
 * Hash FNV-1a de 64 bits en hexadecimal (16 caracteres). Estable entre ejecuciones y versiones
 * de Node; no es criptográfico: solo distingue actuaciones de una plataforma sin identificador.
 */
export function hashEstable(texto: string): string {
  const PRIMO = 0x100000001b3n;
  const MASCARA = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(texto)) {
    hash ^= BigInt(byte);
    hash = (hash * PRIMO) & MASCARA;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Clave con la que una actuación se guarda una sola vez (§4): el identificador de la plataforma
 * si lo da; si no, un hash de su contenido oficial (fechas, descripción y anotación).
 */
export function claveDeDeduplicacion(actuacion: ActuacionExterna): string {
  if (actuacion.idExterno) return actuacion.idExterno.slice(0, LARGO_MAXIMO_DE_CLAVE);
  const contenido = [
    actuacion.expediente,
    actuacion.fechaActuacion,
    actuacion.fechaRegistro ?? '',
    actuacion.descripcion,
    actuacion.anotacion ?? '',
  ].join('\u001f');
  return `h:${hashEstable(contenido)}`;
}

export interface ActuacionConClave extends ActuacionExterna {
  readonly clave: string;
}

/**
 * Actuaciones que aún no están guardadas, comparando por clave con las guardadas. También quita
 * las repetidas dentro de la misma respuesta (la primera gana).
 */
export function seleccionarNuevas(
  clavesGuardadas: ReadonlySet<string>,
  actuaciones: readonly ActuacionExterna[],
): ActuacionConClave[] {
  const vistas = new Set(clavesGuardadas);
  const nuevas: ActuacionConClave[] = [];
  for (const actuacion of actuaciones) {
    const clave = claveDeDeduplicacion(actuacion);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    nuevas.push({ ...actuacion, clave });
  }
  return nuevas;
}

/**
 * Normaliza el texto que llega de una plataforma: quita espacios sobrantes, saltos de línea y
 * tabulaciones internas («ANDREA CATALINA\r\n\t\t VELA» → «ANDREA CATALINA VELA»). Vacío → null.
 */
export function limpiarTexto(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null;
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio === '' ? null : limpio;
}

/** Un término que vence antes de empezar es un dato incoherente: se descarta completo. */
export function terminoCoherente(
  inicia: FechaOficial | null,
  vence: FechaOficial | null,
): { readonly inicia: FechaOficial | null; readonly vence: FechaOficial | null } {
  if (inicia && vence && vence < inicia) return { inicia: null, vence: null };
  return { inicia, vence };
}

/** Orden de la línea de tiempo: la más reciente primero, por fecha de actuación y de registro. */
export function compararActuaciones(a: ActuacionExterna, b: ActuacionExterna): number {
  if (a.fechaActuacion !== b.fechaActuacion) return a.fechaActuacion < b.fechaActuacion ? 1 : -1;
  const registroA = a.fechaRegistro ?? '';
  const registroB = b.fechaRegistro ?? '';
  if (registroA !== registroB) return registroA < registroB ? 1 : -1;
  return 0;
}
