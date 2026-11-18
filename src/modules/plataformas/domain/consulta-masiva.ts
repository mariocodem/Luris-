import { z } from 'zod';
import { reconocerIdentificador } from '@/shared/domain/identificador';
import type { CodigoPlataforma, EstadoConsulta } from './plataforma';
import { mensajeDeResumen, type ResumenDeSincronizacion } from './sincronizacion';

/** Procesos que caben en una consulta masiva (§1, CHECK en la base de datos). */
export const MAXIMO_DE_CONSULTA_MASIVA = 400;

/** Cuántos errores de lectura se muestran en el resumen previo (el total sí se cuenta). */
export const ERRORES_VISIBLES_EN_EL_RESUMEN = 50;

// ─── Lectura de lo que pega o sube la persona ───────────────────────────────────

export interface IdentificadorLeido {
  readonly tipo: 'RADICADO' | 'NUNC';
  /** Solo dígitos: 23 (radicado) o 21 (NUNC). */
  readonly valor: string;
  /** Línea del texto (desde 1) donde apareció por primera vez. */
  readonly linea: number;
}

export interface ErrorDeLectura {
  readonly linea: number;
  /** Lo que se leyó, recortado para mostrarlo. */
  readonly texto: string;
  /** Qué pasó y qué hacer, en lenguaje claro (§10). */
  readonly mensaje: string;
}

export interface LecturaDeIdentificadores {
  /** Sin repetidos, en el orden en que aparecieron. */
  readonly validos: readonly IdentificadorLeido[];
  readonly errores: readonly ErrorDeLectura[];
  /** Cuántos venían repetidos (se consultan una sola vez). */
  readonly repetidos: number;
}

const SEPARADORES_DE_CELDA = /[,;\t|]+/;
const LARGO_MAXIMO_DE_TEXTO = 60;

function recortar(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  return limpio.length > LARGO_MAXIMO_DE_TEXTO
    ? `${limpio.slice(0, LARGO_MAXIMO_DE_TEXTO)}…`
    : limpio;
}

function tieneDigitos(texto: string): boolean {
  return /\d/.test(texto);
}

/**
 * Lee radicados (23 números) y NUNC (21) de un texto libre: uno o varios por línea, separados por
 * salto de línea, coma, punto y coma, tabulador o espacios, con o sin guiones, puntos y espacios
 * dentro del número. Una primera línea sin números se toma como encabezado y se ignora.
 */
export function leerIdentificadores(texto: string): LecturaDeIdentificadores {
  const validos: IdentificadorLeido[] = [];
  const errores: ErrorDeLectura[] = [];
  const vistos = new Set<string>();
  let repetidos = 0;
  let primeraLineaConTexto = true;

  const agregar = (segmento: string, linea: number): boolean => {
    const reconocido = reconocerIdentificador(segmento);
    if (!reconocido.ok) return false;
    const { tipo, valor } = reconocido.value;
    const clave = `${tipo}:${valor}`;
    if (vistos.has(clave)) repetidos += 1;
    else {
      vistos.add(clave);
      validos.push({ tipo, valor, linea });
    }
    return true;
  };

  texto.split(/\r?\n/).forEach((lineaDeTexto, indice) => {
    const linea = indice + 1;
    if (lineaDeTexto.trim() === '') return;
    const esLaPrimera = primeraLineaConTexto;
    primeraLineaConTexto = false;
    if (esLaPrimera && !tieneDigitos(lineaDeTexto)) return; // «Radicado», «Número»…

    for (const segmento of lineaDeTexto.split(SEPARADORES_DE_CELDA)) {
      const limpio = segmento.trim();
      if (limpio === '') continue;
      if (agregar(limpio, linea)) continue;

      // Varios números separados por espacios: se prueba cada uno.
      const partes = limpio.split(/\s+/);
      if (partes.length > 1) {
        const fallidas = partes.filter((parte) => !agregar(parte, linea));
        if (fallidas.length < partes.length) {
          for (const parte of fallidas) errores.push(errorDe(parte, linea));
          continue;
        }
      }
      errores.push(errorDe(limpio, linea));
    }
  });

  return { validos, errores, repetidos };
}

function errorDe(texto: string, linea: number): ErrorDeLectura {
  const reconocido = reconocerIdentificador(texto);
  const mensaje = reconocido.ok
    ? 'No pudimos leer este número.'
    : tieneDigitos(texto) || reconocido.error.motivo !== 'VACIO'
      ? reconocido.error.mensajeUsuario
      : 'Esto no parece un radicado ni un NUNC: debe tener solo números.';
  return { linea, texto: recortar(texto), mensaje };
}

// ─── Estado del lote ──────────────────────────────────────────────────────────

export type EstadoDeItem =
  'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'FALLIDO' | 'PENDIENTE_CONFIRMACION';

export interface ConteoDeItems {
  readonly total: number;
  /** En cola, sin empezar. */
  readonly pendientes: number;
  readonly enProceso: number;
  readonly completados: number;
  readonly fallidos: number;
  /** Plataformas con consulta asistida: esperan a la persona (§6). */
  readonly porConfirmar: number;
}

export function contarItems(estados: readonly EstadoDeItem[]): ConteoDeItems {
  const cuenta = (estado: EstadoDeItem) => estados.filter((e) => e === estado).length;
  return {
    total: estados.length,
    pendientes: cuenta('PENDIENTE'),
    enProceso: cuenta('EN_PROCESO'),
    completados: cuenta('COMPLETADO'),
    fallidos: cuenta('FALLIDO'),
    porConfirmar: cuenta('PENDIENTE_CONFIRMACION'),
  };
}

/** El lote terminó cuando LURIS ya no tiene nada por consultar (lo asistido espera a la persona). */
export function loteTermino(conteo: ConteoDeItems): boolean {
  return conteo.pendientes + conteo.enProceso === 0;
}

/** Porcentaje de lo que LURIS ya resolvió o dejó en manos de la persona (0 a 100). */
export function porcentajeDeAvance(conteo: ConteoDeItems): number {
  if (conteo.total === 0) return 100;
  const hechos = conteo.completados + conteo.fallidos + conteo.porConfirmar;
  return Math.round((hechos / conteo.total) * 100);
}

// ─── Resultado de un ítem ─────────────────────────────────────────────────────

/** Lo que se guarda y se muestra de cada ítem: sin datos técnicos (§10). */
export const esquemaResumenDeItem = z.object({
  mensaje: z.string(),
  /** Actuaciones nuevas guardadas por esta consulta. */
  nuevas: z.number().int().nonnegative().nullable(),
  /** Actuaciones que informó la plataforma. */
  total: z.number().int().nonnegative().nullable(),
});
export type ResumenDeItem = z.infer<typeof esquemaResumenDeItem>;

export type ResultadoDeItem =
  | {
      readonly estado: 'COMPLETADO' | 'FALLIDO';
      readonly resultado: EstadoConsulta | null;
      readonly resumen: ResumenDeItem;
    }
  | { readonly estado: 'EN_PROCESO'; readonly resultado: null; readonly resumen: ResumenDeItem };

/** Cómo queda un ítem según cómo terminó su sincronización. */
export function resultadoDeSincronizacion(
  plataforma: CodigoPlataforma,
  resumen: ResumenDeSincronizacion,
): ResultadoDeItem {
  const mensaje = mensajeDeResumen(plataforma, resumen);
  switch (resumen.tipo) {
    case 'SINCRONIZADO':
      return {
        estado: 'COMPLETADO',
        resultado: 'EXITOSA',
        resumen: { mensaje, nuevas: resumen.nuevas, total: resumen.total },
      };
    case 'FALLIDO':
      return {
        estado: 'FALLIDO',
        resultado: resumen.codigo,
        resumen: { mensaje, nuevas: null, total: null },
      };
    case 'OMITIDO':
      return {
        estado: 'FALLIDO',
        resultado: null,
        resumen: { mensaje, nuevas: null, total: null },
      };
  }
}

/** Una consulta pasajera falló y se reintentará sola: el ítem sigue en curso, con el motivo. */
export function resultadoDeReintento(
  plataforma: CodigoPlataforma,
  codigo: Exclude<EstadoConsulta, 'EXITOSA'>,
): ResultadoDeItem {
  return {
    estado: 'EN_PROCESO',
    resultado: null,
    resumen: {
      mensaje: mensajeDeResumen(plataforma, { tipo: 'FALLIDO', codigo }),
      nuevas: null,
      total: null,
    },
  };
}

/** El ítem de una plataforma asistida espera a que la persona resuelva el reto (§6). */
export const MENSAJE_DE_ITEM_ASISTIDO =
  'Esta plataforma pide resolver una verificación. Confírmala en «Pendientes de tu confirmación».';

/** Cómo se llama cada estado de un ítem ante la persona (pantalla y exportación). */
export const ETIQUETA_DE_ESTADO_DE_ITEM: Readonly<Record<EstadoDeItem, string>> = {
  PENDIENTE: 'En cola',
  EN_PROCESO: 'Consultando',
  COMPLETADO: 'Listo',
  FALLIDO: 'Con problemas',
  PENDIENTE_CONFIRMACION: 'Espera tu confirmación',
};
