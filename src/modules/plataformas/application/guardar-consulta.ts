import type { Logger } from '@/shared/domain/logger';
import { seleccionarNuevas } from '../domain/actuaciones';
import type { ResultadoConsulta } from '../domain/consulta';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { ResumenDeSincronizacion } from '../domain/sincronizacion';
import type { ColaDeTrabajos, Reloj, RepositorioDeSincronizacion } from './puertos';

/**
 * En la primera consulta solo se piden los documentos de las actuaciones más recientes: traer los
 * de toda la historia de golpe sería una ráfaga de solicitudes al portal (§6). Los de las
 * actuaciones nuevas siempre se piden.
 */
export const DOCUMENTOS_EN_CARGA_INICIAL = 10;

export interface DependenciasDeGuardado {
  readonly repositorio: RepositorioDeSincronizacion;
  readonly cola: ColaDeTrabajos;
  /** Plataformas que dan documentos (para encolar su descarga). */
  readonly conDocumentos: ReadonlySet<CodigoPlataforma>;
  readonly reloj: Reloj;
  readonly logger: Logger;
}

/**
 * Guarda el resultado de una consulta, venga de un adaptador automático o de una consulta
 * asistida: detecta las actuaciones nuevas comparando con las guardadas, marca la primera
 * consulta exitosa como carga inicial (historia, no novedades) y encola sus documentos.
 */
export async function guardarConsulta(
  deps: DependenciasDeGuardado,
  despachoId: string,
  procesoId: string,
  resultado: ResultadoConsulta,
): Promise<Extract<ResumenDeSincronizacion, { tipo: 'SINCRONIZADO' }>> {
  const codigo = resultado.plataforma;
  const previo = await deps.repositorio.estadoPrevio(despachoId, procesoId, codigo);
  const nuevas = seleccionarNuevas(previo.claves, resultado.actuaciones);
  const cargaInicial = !previo.yaSincronizado;
  const guardadas = await deps.repositorio.guardarResultado(despachoId, procesoId, {
    resultado,
    nuevas,
    cargaInicial,
    ahora: deps.reloj.ahora(),
  });

  if (deps.conDocumentos.has(codigo)) {
    // En el orden de la línea de tiempo (la más reciente primero).
    const orden = new Map(nuevas.map((a, i) => [a.clave, i]));
    const conDocumentos = guardadas
      .filter((a) => a.tieneDocumentos)
      .sort((a, b) => (orden.get(a.clave) ?? 0) - (orden.get(b.clave) ?? 0));
    const aPedir = cargaInicial
      ? conDocumentos.slice(0, DOCUMENTOS_EN_CARGA_INICIAL)
      : conDocumentos;
    for (const actuacion of aPedir) {
      await deps.cola.encolarDocumentos({
        despachoId,
        actuacionId: actuacion.id,
        plataforma: codigo,
      });
    }
  }

  deps.logger.info('Proceso sincronizado', {
    despachoId,
    procesoId,
    plataforma: codigo,
    nuevas: guardadas.length,
    cargaInicial,
  });
  return {
    tipo: 'SINCRONIZADO',
    nuevas: guardadas.length,
    total: resultado.actuaciones.length,
    cargaInicial,
    reservado: resultado.expedientes.every((e) => e.reservado),
    ...(resultado.soloDatos && { soloDatos: true }),
  };
}
