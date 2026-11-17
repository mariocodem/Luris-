import { type CodigoErrorPlataforma, mensajeDeErrorDePlataforma } from './errores';
import { type CodigoPlataforma, deLaPlataforma, NOMBRE_EN_FRASE } from './plataforma';

/** Cómo terminó una sincronización de un proceso en una plataforma. */
export type ResumenDeSincronizacion =
  | {
      readonly tipo: 'SINCRONIZADO';
      /** Actuaciones guardadas en esta consulta. */
      readonly nuevas: number;
      /** Actuaciones que informó la plataforma. */
      readonly total: number;
      /** Primera consulta exitosa: las actuaciones son la historia del proceso. */
      readonly cargaInicial: boolean;
      readonly reservado: boolean;
      /** La plataforma solo aportó datos del proceso (ver ResultadoConsulta.soloDatos). */
      readonly soloDatos?: boolean;
    }
  | { readonly tipo: 'FALLIDO'; readonly codigo: CodigoErrorPlataforma }
  | {
      readonly tipo: 'OMITIDO';
      readonly motivo: 'PROCESO_NO_ENCONTRADO' | 'SIN_IDENTIFICADOR' | 'PLATAFORMA_NO_CONFIGURADA';
    };

function actuaciones(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'actuación' : 'actuaciones'}`;
}

/** Mensaje para la persona que pidió la consulta (§10: qué pasó y qué puede hacer). */
export function mensajeDeResumen(
  plataforma: CodigoPlataforma,
  resumen: ResumenDeSincronizacion,
): string {
  const nombre = NOMBRE_EN_FRASE[plataforma];
  switch (resumen.tipo) {
    case 'SINCRONIZADO':
      if (resumen.soloDatos) {
        return `Actualizamos los datos del proceso en ${nombre}. Sus actuaciones llegan por la Rama Judicial.`;
      }
      if (resumen.reservado) {
        return `En ${nombre} este proceso es reservado: la plataforma no publica sus actuaciones.`;
      }
      if (resumen.cargaInicial) {
        return resumen.nuevas > 0
          ? `Trajimos ${actuaciones(resumen.nuevas)} ${deLaPlataforma(plataforma)}. Desde ahora te avisaremos de las nuevas.`
          : `Encontramos el proceso en ${nombre}, aún sin actuaciones publicadas.`;
      }
      return resumen.nuevas > 0
        ? `${resumen.nuevas === 1 ? 'Hay una actuación nueva' : `Hay ${actuaciones(resumen.nuevas)} nuevas`} en ${nombre}.`
        : `Sin actuaciones nuevas en ${nombre}.`;
    case 'FALLIDO':
      return mensajeDeErrorDePlataforma(plataforma, resumen.codigo);
    case 'OMITIDO':
      return resumen.motivo === 'SIN_IDENTIFICADOR'
        ? `Este proceso no tiene el número con el que se consulta ${nombre}.`
        : `No pudimos consultar ${nombre} para este proceso. Recarga la página e inténtalo de nuevo.`;
  }
}
