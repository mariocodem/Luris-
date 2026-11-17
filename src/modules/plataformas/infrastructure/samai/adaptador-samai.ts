import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { limpiarTexto } from '../../domain/actuaciones';
import type { DetalleDeExpediente, ExpedienteExterno, SujetoProcesal } from '../../domain/consulta';
import { type CodigoErrorPlataforma, ErrorPlataforma } from '../../domain/errores';
import { corporacionesDondeBuscar } from '../../domain/jurisdiccion';
import type { ContextoConsulta, PlataformaJudicial } from '../../domain/puertos';
import type { ClienteHttp, FalloHttp } from '../http/cliente-http';
import { esquemaBusquedaSamai, esquemaErrorSamai, type ItemSamai } from './esquemas';

/**
 * Adaptador de SAMAI, la sede electrónica de la jurisdicción de lo contencioso administrativo
 * (§6.3). Usa la búsqueda pública por radicado, que no pide reto: trae los datos del proceso
 * (clase, despacho y titular, partes, si está vigente) y el enlace a su página en SAMAI.
 *
 * Las actuaciones no se toman de aquí: la página del proceso pide «No soy un robot» a quien no ha
 * iniciado sesión, y LURIS no resuelve retos. Llegan por la CPNU, que las publica tomadas de
 * SAMAI (verificado; ver docs/plataformas/samai.md). Por eso el resultado es `soloDatos`.
 */

const PLATAFORMA = 'SAMAI';

export interface OpcionesSamai {
  /** p. ej. https://samai.consejodeestado.gov.co */
  readonly urlBase: string;
  readonly http: ClienteHttp;
  readonly logger: Logger;
}

export function crearPlataformaSamai(opciones: OpcionesSamai): PlataformaJudicial {
  const base = opciones.urlBase.replace(/\/+$/, '');
  const logger = opciones.logger.child({ plataforma: PLATAFORMA });
  const url = `${base}/Vistas/Casos/Jprocesos.ashx/buscar`;

  function fallo(codigo: CodigoErrorPlataforma, detalle: string): ErrorPlataforma {
    if (codigo === 'RESPUESTA_INESPERADA')
      logger.error('Respuesta inesperada de SAMAI', { detalle });
    return new ErrorPlataforma(PLATAFORMA, codigo, detalle);
  }

  function falloDeRed(f: FalloHttp): ErrorPlataforma {
    switch (f.tipo) {
      case 'LIMITE':
        return fallo('LIMITE_DE_CONSULTAS', `${url}: ${f.detalle}`);
      case 'FORMATO':
      case 'DEMASIADO_GRANDE':
        return fallo('RESPUESTA_INESPERADA', `${url}: ${f.tipo}`);
      case 'CANCELADO':
      case 'NO_DISPONIBLE':
        return fallo('PLATAFORMA_NO_DISPONIBLE', `${url}: ${f.tipo}`);
    }
  }

  async function buscar(
    radicado: string,
    corporacion: string,
    ctx: ContextoConsulta,
  ): Promise<Result<readonly ItemSamai[], ErrorPlataforma>> {
    const respuesta = await opciones.http.enviarJson(
      url,
      {
        tipoBusqueda: 'radicado',
        criterio: radicado,
        fraseExacta: false,
        ambito: 'corporacion',
        corporacion,
        seccion: '',
        ponente: '',
        fechaDesde: '',
        fechaHasta: '',
        estado: '',
        tipoParte: '',
        pagina: 1,
        tamanoPagina: 10,
      },
      ctx.signal,
    );
    if (!respuesta.ok) return err(falloDeRed(respuesta.error));
    const { estado, cuerpo } = respuesta.value;
    if (estado === 403) {
      opciones.http.pausar();
      return err(fallo('LIMITE_DE_CONSULTAS', `${url}: HTTP 403`));
    }
    const busqueda = esquemaBusquedaSamai.safeParse(cuerpo);
    if (estado === 200 && busqueda.success) {
      return ok(busqueda.data.data.items.filter((item) => item.radicado === radicado));
    }
    const error = esquemaErrorSamai.safeParse(cuerpo);
    const detalle = error.success ? (error.data.error?.message ?? '') : JSON.stringify(cuerpo);
    return err(fallo('RESPUESTA_INESPERADA', `${url}: HTTP ${estado} ${detalle.slice(0, 200)}`));
  }

  return {
    codigo: PLATAFORMA,
    identificador: 'RADICADO',

    async consultar(radicado, ctx) {
      for (const corporacion of corporacionesDondeBuscar(radicado)) {
        const items = await buscar(radicado, corporacion, ctx);
        if (!items.ok) return items;
        if (items.value.length > 0) {
          return ok({
            plataforma: PLATAFORMA,
            expedientes: items.value.map((item) => aExpediente(item, base)),
            actuaciones: [],
            soloDatos: true,
          });
        }
      }
      return err(fallo('NO_ENCONTRADO', `radicado ${radicado} sin resultados en SAMAI`));
    },
  };
}

/** SAMAI rellena con «_RDRQ_NULL» algunos campos vacíos. */
function textoSamai(texto: string | null | undefined): string | null {
  return limpiarTexto(texto?.replaceAll('_RDRQ_NULL', ''));
}

function aExpediente(item: ItemSamai, base: string): ExpedienteExterno {
  const despacho = item.identidadDespacho;
  const sujetos: SujetoProcesal[] = [
    ...(textoSamai(item.demandante)
      ? [{ tipo: 'Demandante', nombre: textoSamai(item.demandante) ?? '' }]
      : []),
    ...(textoSamai(item.demandado)
      ? [{ tipo: 'Demandado', nombre: textoSamai(item.demandado) ?? '' }]
      : []),
  ];
  const vigente = textoSamai(item.vigente)?.toUpperCase();
  const filas: readonly (readonly [string, string | null])[] = [
    ['Vigente', vigente === 'SI' || vigente === 'SÍ' ? 'Sí' : vigente === 'NO' ? 'No' : null],
    ['Titular del despacho', textoSamai(despacho?.currentHolder)],
    ['Número interno', textoSamai(item.interno)],
    ['Asunto', textoSamai(item.asunto)],
  ];
  const detalles: DetalleDeExpediente[] = filas.flatMap(([etiqueta, valor]) =>
    valor ? [{ etiqueta, valor }] : [],
  );
  const ruta = textoSamai(item.urlDetalle);
  return {
    idExterno: item.guid,
    despachoJudicial:
      textoSamai(despacho?.officeName) ??
      textoSamai(item.nombreDespachoOperativo) ??
      textoSamai(item.ponente),
    departamento: null,
    ponente: textoSamai(despacho?.historicalReportingJudge) ?? textoSamai(item.ponente),
    tipoProceso: null,
    claseProceso: textoSamai(item.clase),
    subclaseProceso: null,
    recurso: null,
    ubicacion: null,
    fechaRadicacion: item.fechaIngreso,
    ultimaActuacion: null,
    sujetos,
    reservado: item.esPrivado === true,
    detalles,
    // Solo rutas del propio SAMAI: nunca un enlace a otro sitio.
    urlDeConsulta: ruta?.startsWith('/') ? `${base}${ruta}` : null,
  };
}
