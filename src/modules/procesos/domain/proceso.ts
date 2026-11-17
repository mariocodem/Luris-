import type { Nunc } from '@/shared/domain/nunc';
import type { Radicado } from '@/shared/domain/radicado';

/** Límites de los datos de un proceso (coinciden con las columnas de la base de datos). */
export const LIMITES_DE_PROCESO = {
  alias: 200,
  cliente: 300,
  etiqueta: 50,
  etiquetasPorProceso: 10,
} as const;

/** Datos que la persona escribe al registrar o editar un proceso, ya validados. */
export interface DatosDeProceso {
  readonly radicado: Radicado | null;
  readonly nunc: Nunc | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  /** Nombres de etiqueta normalizados y sin repetir. */
  readonly etiquetas: readonly string[];
}

export type TipoAsignacion = 'RESPONSABLE' | 'ASIGNADO';

export interface Asignacion {
  readonly membresiaId: string;
  readonly tipo: TipoAsignacion;
}

/** Cómo se nombra un proceso en la interfaz: su alias o, si no tiene, su identificador. */
export function nombreDeProceso(proceso: {
  readonly alias: string | null;
  readonly radicado: string | null;
  readonly nunc: string | null;
}): string {
  if (proceso.alias) return proceso.alias;
  if (proceso.radicado) return `Radicado ${proceso.radicado}`;
  return `NUNC ${proceso.nunc ?? ''}`.trim();
}

// ─── Búsqueda ─────────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes y con espacios simples: «Pérez  GARCÍA» → «perez garcia». */
export function normalizarParaBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto en el que se busca un proceso por nombre: su alias y su cliente, normalizados. */
export function textoDeBusqueda(datos: {
  readonly alias: string | null;
  readonly cliente: string | null;
}): string {
  return normalizarParaBusqueda([datos.alias, datos.cliente].filter(Boolean).join(' '));
}

// ─── Etiquetas ────────────────────────────────────────────────────────────────

/** Quita espacios sobrantes de un nombre de etiqueta. */
export function normalizarEtiqueta(texto: string): string {
  return texto.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Clave para comparar etiquetas sin distinguir mayúsculas ni tildes: «Urgente», «urgente» y
 * «URGENTE» son la misma etiqueta.
 */
export function claveDeEtiqueta(nombre: string): string {
  return normalizarEtiqueta(nombre)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO');
}

/** Normaliza una lista de etiquetas y quita las repetidas (conserva la primera escritura). */
export function unificarEtiquetas(nombres: readonly string[]): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const nombre of nombres.map(normalizarEtiqueta)) {
    const clave = claveDeEtiqueta(nombre);
    if (nombre === '' || vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push(nombre);
  }
  return resultado;
}

/** Separa un texto como «Civil, Urgente; Bogotá» en etiquetas. */
export function separarEtiquetas(texto: string): string[] {
  return unificarEtiquetas(texto.split(/[,;|]/));
}

/** Problemas de una lista de etiquetas, con mensajes para la persona usuaria. */
export function problemasDeEtiquetas(etiquetas: readonly string[]): string[] {
  const problemas: string[] = [];
  const largas = etiquetas.filter((e) => e.length > LIMITES_DE_PROCESO.etiqueta);
  if (largas.length > 0) {
    problemas.push(
      `Cada etiqueta puede tener máximo ${LIMITES_DE_PROCESO.etiqueta} caracteres; acorta «${largas[0]?.slice(0, 20)}…».`,
    );
  }
  if (etiquetas.length > LIMITES_DE_PROCESO.etiquetasPorProceso) {
    problemas.push(
      `Un proceso puede tener máximo ${LIMITES_DE_PROCESO.etiquetasPorProceso} etiquetas; tiene ${etiquetas.length}.`,
    );
  }
  return problemas;
}
