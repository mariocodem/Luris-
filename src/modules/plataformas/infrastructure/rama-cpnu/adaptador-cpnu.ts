import type { z } from 'zod';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { compararActuaciones, limpiarTexto, terminoCoherente } from '../../domain/actuaciones';
import type {
  ActuacionExterna,
  ExpedienteExterno,
  ResultadoConsulta,
  SujetoProcesal,
} from '../../domain/consulta';
import { type CodigoErrorPlataforma, ErrorPlataforma } from '../../domain/errores';
import type { ContextoConsulta, PlataformaJudicial } from '../../domain/puertos';
import type { ClienteHttp, FalloHttp } from '../http/cliente-http';
import {
  type BusquedaCpnu,
  esquemaActuaciones,
  esquemaBusqueda,
  esquemaDetalle,
  type ActuacionesCpnu,
} from './esquemas';

/**
 * Adaptador de la Consulta de Procesos Nacional Unificada de la Rama Judicial (§6.1).
 *
 * Flujo: busca el radicado → por cada expediente encontrado, trae su detalle y todas las
 * páginas de actuaciones → une las actuaciones en una sola línea de tiempo. La CPNU también
 * muestra los procesos de Tyba y de otros sistemas de la Rama.
 */

export interface OpcionesCpnu {
  /** p. ej. https://consultaprocesos.ramajudicial.gov.co:448/api/v2 */
  readonly urlBase: string;
  readonly http: ClienteHttp;
  readonly logger: Logger;
  /** Tope de páginas de actuaciones por expediente (40 por página). */
  readonly maximoDePaginas?: number;
}

const MAXIMO_DE_PAGINAS = 50;
const MAXIMO_DE_PAGINAS_DE_BUSQUEDA = 5;
const PLATAFORMA = 'RAMA_CPNU';
/**
 * La CPNU responde 403 (página HTML de su cortafuegos) cuando recibe demasiadas solicitudes
 * seguidas: no es un error del proceso, es la señal de bajar el ritmo.
 */
export const ESTADO_DE_BLOQUEO = 403;

export function crearPlataformaCpnu(opciones: OpcionesCpnu): PlataformaJudicial {
  const base = opciones.urlBase.replace(/\/+$/, '');
  const logger = opciones.logger.child({ plataforma: PLATAFORMA });
  const maximoDePaginas = opciones.maximoDePaginas ?? MAXIMO_DE_PAGINAS;

  function fallo(codigo: CodigoErrorPlataforma, detalle: string, causa?: unknown) {
    if (codigo === 'RESPUESTA_INESPERADA')
      logger.error('Respuesta inesperada de la CPNU', { detalle });
    return new ErrorPlataforma(PLATAFORMA, codigo, detalle, causa);
  }

  function falloDeRed(f: FalloHttp, url: string): ErrorPlataforma {
    switch (f.tipo) {
      case 'LIMITE':
        return fallo('LIMITE_DE_CONSULTAS', `${url}: ${f.detalle}`);
      case 'FORMATO':
        return fallo('RESPUESTA_INESPERADA', `${url}: ${f.detalle}`);
      case 'DEMASIADO_GRANDE':
        return fallo('RESPUESTA_INESPERADA', `${url}: respuesta demasiado grande`);
      case 'CANCELADO':
        return fallo('PLATAFORMA_NO_DISPONIBLE', `${url}: consulta cancelada`);
      case 'NO_DISPONIBLE':
        return fallo('PLATAFORMA_NO_DISPONIBLE', `${url}: ${f.detalle}`);
    }
  }

  /** GET que exige 200 y un cuerpo con el esquema dado. */
  async function obtener<T>(
    ruta: string,
    esquema: z.ZodType<T>,
    ctx: ContextoConsulta,
  ): Promise<Result<T, ErrorPlataforma>> {
    const url = `${base}${ruta}`;
    const respuesta = await opciones.http.obtenerJson(url, ctx.signal);
    if (!respuesta.ok) return err(falloDeRed(respuesta.error, url));
    if (respuesta.value.estado === ESTADO_DE_BLOQUEO) {
      opciones.http.pausar();
      return err(fallo('LIMITE_DE_CONSULTAS', `${url}: HTTP 403 (la CPNU frenó las consultas)`));
    }
    if (respuesta.value.estado !== 200) {
      return err(
        fallo(
          'RESPUESTA_INESPERADA',
          `${url}: HTTP ${respuesta.value.estado} ${String(JSON.stringify(respuesta.value.cuerpo)).slice(0, 200)}`,
        ),
      );
    }
    const validado = esquema.safeParse(respuesta.value.cuerpo);
    if (!validado.success) {
      return err(fallo('RESPUESTA_INESPERADA', `${url}: ${validado.error.message.slice(0, 500)}`));
    }
    return ok(validado.data);
  }

  async function buscar(
    radicado: string,
    ctx: ContextoConsulta,
  ): Promise<Result<BusquedaCpnu['procesos'], ErrorPlataforma>> {
    const procesos: BusquedaCpnu['procesos'][number][] = [];
    for (let pagina = 1; pagina <= MAXIMO_DE_PAGINAS_DE_BUSQUEDA; pagina++) {
      const busqueda = await obtener(
        `/Procesos/Consulta/NumeroRadicacion?numero=${radicado}&SoloActivos=false&pagina=${pagina}`,
        esquemaBusqueda,
        ctx,
      );
      if (!busqueda.ok) return busqueda;
      procesos.push(...busqueda.value.procesos);
      if (pagina >= busqueda.value.paginacion.cantidadPaginas) break;
    }
    // La búsqueda es exacta, pero se filtra igual: nunca mezclar actuaciones de otro radicado.
    const unicos = new Map(
      procesos.filter((p) => p.llaveProceso === radicado).map((p) => [p.idProceso, p]),
    );
    return ok([...unicos.values()]);
  }

  async function actuacionesDe(
    idProceso: string,
    ctx: ContextoConsulta,
  ): Promise<Result<ActuacionesCpnu['actuaciones'], ErrorPlataforma>> {
    const todas: ActuacionesCpnu['actuaciones'][number][] = [];
    for (let pagina = 1; pagina <= maximoDePaginas; pagina++) {
      const respuesta = await obtener(
        `/Proceso/Actuaciones/${idProceso}?pagina=${pagina}`,
        esquemaActuaciones,
        ctx,
      );
      if (!respuesta.ok) return respuesta;
      todas.push(...respuesta.value.actuaciones);
      const paginas = respuesta.value.paginacion.cantidadPaginas;
      if (pagina >= paginas) break;
      if (pagina === maximoDePaginas) {
        logger.warn('Expediente con más páginas de actuaciones que el tope', {
          idProceso,
          paginas,
        });
      }
    }
    return ok(todas);
  }

  return {
    codigo: PLATAFORMA,
    identificador: 'RADICADO',

    async consultar(radicado, ctx) {
      const procesos = await buscar(radicado, ctx);
      if (!procesos.ok) return procesos;
      if (procesos.value.length === 0) {
        return err(fallo('NO_ENCONTRADO', `radicado ${radicado} sin resultados`));
      }

      const expedientes: ExpedienteExterno[] = [];
      const actuaciones: ActuacionExterna[] = [];
      for (const proceso of procesos.value) {
        const despachoJudicial = limpiarTexto(proceso.despacho);
        const sujetos = leerSujetos(proceso.sujetosProcesales);
        if (proceso.esPrivado) {
          expedientes.push(expedienteReservado(proceso, despachoJudicial, sujetos));
          continue;
        }

        const detalle = await obtener(`/Proceso/Detalle/${proceso.idProceso}`, esquemaDetalle, ctx);
        if (!detalle.ok) return detalle;
        const lista = await actuacionesDe(proceso.idProceso, ctx);
        if (!lista.ok) return lista;

        expedientes.push({
          idExterno: proceso.idProceso,
          despachoJudicial: limpiarTexto(detalle.value.despacho) ?? despachoJudicial,
          departamento: limpiarTexto(proceso.departamento),
          ponente: limpiarTexto(detalle.value.ponente),
          tipoProceso: limpiarTexto(detalle.value.tipoProceso),
          claseProceso: limpiarTexto(detalle.value.claseProceso),
          subclaseProceso: limpiarTexto(detalle.value.subclaseProceso),
          recurso: limpiarTexto(detalle.value.recurso),
          ubicacion: limpiarTexto(detalle.value.ubicacion),
          fechaRadicacion: detalle.value.fechaProceso ?? proceso.fechaProceso,
          ultimaActuacion: proceso.fechaUltimaActuacion,
          sujetos,
          reservado: detalle.value.esPrivado === true,
          detalles: [],
          urlDeConsulta: null,
        });
        for (const a of lista.value) {
          const termino = terminoCoherente(a.fechaInicial, a.fechaFinal);
          actuaciones.push({
            idExterno: a.idRegActuacion,
            expediente: proceso.idProceso,
            despachoJudicial,
            fechaActuacion: a.fechaActuacion,
            fechaRegistro: a.fechaRegistro,
            descripcion: limpiarTexto(a.actuacion) ?? 'Actuación sin descripción',
            anotacion: limpiarTexto(a.anotacion),
            terminoInicia: termino.inicia,
            terminoVence: termino.vence,
            tieneDocumentos: a.conDocumentos === true,
          });
        }
      }

      // El expediente con la actuación más reciente primero: es el que está vivo.
      expedientes.sort((a, b) => (b.ultimaActuacion ?? '').localeCompare(a.ultimaActuacion ?? ''));
      const resultado: ResultadoConsulta = {
        plataforma: PLATAFORMA,
        expedientes,
        actuaciones: actuaciones.sort(compararActuaciones),
      };
      return ok(resultado);
    },
  };
}

function expedienteReservado(
  proceso: BusquedaCpnu['procesos'][number],
  despachoJudicial: string | null,
  sujetos: readonly SujetoProcesal[],
): ExpedienteExterno {
  return {
    idExterno: proceso.idProceso,
    despachoJudicial,
    departamento: limpiarTexto(proceso.departamento),
    ponente: null,
    tipoProceso: null,
    claseProceso: null,
    subclaseProceso: null,
    recurso: null,
    ubicacion: null,
    fechaRadicacion: proceso.fechaProceso,
    ultimaActuacion: proceso.fechaUltimaActuacion,
    sujetos,
    reservado: true,
    detalles: [],
    urlDeConsulta: null,
  };
}

/**
 * Lee las partes de «Demandante: BANCO X | Demandado: PERSONA Y». La CPNU no siempre separa
 * igual (a veces trae saltos de línea dentro de un nombre), así que se normaliza el texto.
 */
export function leerSujetos(texto: string | null | undefined): SujetoProcesal[] {
  if (!texto) return [];
  const sujetos: SujetoProcesal[] = [];
  for (const parte of texto.split('|')) {
    const limpia = limpiarTexto(parte);
    if (!limpia) continue;
    const separador = limpia.indexOf(':');
    const tipo = separador > 0 ? limpiarTexto(limpia.slice(0, separador)) : null;
    const nombre = separador > 0 ? limpiarTexto(limpia.slice(separador + 1)) : limpia;
    if (nombre) sujetos.push({ tipo: tipo ?? 'Parte', nombre });
  }
  return sujetos;
}
