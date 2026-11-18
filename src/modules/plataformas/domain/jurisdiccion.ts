/**
 * Lo que dice el radicado (23 dígitos) sobre dónde está el proceso. Estructura del Código Único
 * de Proceso: municipio (5) + entidad (2) + especialidad (2) + despacho (3) + año (4) +
 * consecutivo (5) + recurso (2).
 *
 * En SAMAI (jurisdicción de lo contencioso administrativo) las corporaciones son exactamente los
 * 7 primeros dígitos (municipio + entidad), con estas entidades (catálogo de SAMAI, 16/11/2026):
 * 03 = Consejo de Estado, 23 = tribunal administrativo, 33 = juzgado administrativo.
 */

const ENTIDADES_CONTENCIOSAS = new Set(['03', '23', '33']);

/** Corporación del Consejo de Estado en SAMAI: recibe la segunda instancia de los tribunales. */
export const CORPORACION_CONSEJO_DE_ESTADO = '1100103';

export function esDeLoContenciosoAdministrativo(radicado: string): boolean {
  return /^\d{23}$/.test(radicado) && ENTIDADES_CONTENCIOSAS.has(radicado.slice(5, 7));
}

/** Corporación de SAMAI donde se radicó el proceso (municipio + entidad). */
export function corporacionDeOrigen(radicado: string): string {
  return radicado.slice(0, 7);
}

/**
 * Dónde buscarlo en SAMAI, en orden: la corporación de origen y, si no es el Consejo de Estado, el
 * Consejo de Estado (un proceso en segunda instancia conserva el radicado de origen).
 */
export function corporacionesDondeBuscar(radicado: string): readonly string[] {
  const origen = corporacionDeOrigen(radicado);
  return origen === CORPORACION_CONSEJO_DE_ESTADO
    ? [origen]
    : [origen, CORPORACION_CONSEJO_DE_ESTADO];
}

/**
 * Especialidad laboral (dígitos 8 y 9 del radicado = «05»). SIUGJ empezó por la jurisdicción
 * ordinaria laboral (Sala de Casación Laboral, juzgados laborales del circuito y municipales de
 * pequeñas causas; portal de SIUGJ, 17/11/2026). Es un filtro para no consultar SIUGJ con procesos
 * que no pueden estar allí; se ampliará cuando SIUGJ sume especialidades.
 */
export function esDeLaEspecialidadLaboral(radicado: string): boolean {
  return /^\d{23}$/.test(radicado) && radicado.slice(7, 9) === '05';
}
