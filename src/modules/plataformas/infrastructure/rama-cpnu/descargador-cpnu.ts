import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import { limpiarTexto } from '../../domain/actuaciones';
import { ErrorPlataforma } from '../../domain/errores';
import type { DescargadorDeDocumentos } from '../../domain/puertos';
import type { ClienteHttp } from '../http/cliente-http';
import { ESTADO_DE_BLOQUEO } from './adaptador-cpnu';
import { esquemaDocumentos, esquemaError } from './esquemas';

const PLATAFORMA = 'RAMA_CPNU';

/**
 * Documentos de las actuaciones en la CPNU (rutas confirmadas en el portal oficial; ver
 * docs/plataformas/rama-cpnu.md):
 * - Lista: GET /Proceso/DocumentosActuacion/{idRegActuacion} → [{idRegDocumento, nombre…}]
 * - Archivo: GET /Descarga/DocumentoActuacion/{idRegDocumento}
 * Un 404 en la lista significa «sin documentos»; en la descarga, «no disponible por ahora».
 */
export function crearDescargadorCpnu(opciones: {
  readonly urlBase: string;
  readonly http: ClienteHttp;
  readonly logger: Logger;
}): DescargadorDeDocumentos {
  const base = opciones.urlBase.replace(/\/+$/, '');
  const logger = opciones.logger.child({ plataforma: PLATAFORMA });

  function inesperado(detalle: string): ErrorPlataforma {
    logger.error('Respuesta inesperada de la CPNU (documentos)', { detalle });
    return new ErrorPlataforma(PLATAFORMA, 'RESPUESTA_INESPERADA', detalle);
  }

  function bloqueo(url: string): ErrorPlataforma {
    opciones.http.pausar();
    return new ErrorPlataforma(PLATAFORMA, 'LIMITE_DE_CONSULTAS', `${url}: HTTP 403 (bloqueo)`);
  }

  return {
    plataforma: PLATAFORMA,

    async listar(idActuacion, ctx) {
      const url = `${base}/Proceso/DocumentosActuacion/${encodeURIComponent(idActuacion)}`;
      const respuesta = await opciones.http.obtenerJson(url, ctx.signal);
      if (!respuesta.ok) {
        const codigo =
          respuesta.error.tipo === 'LIMITE' ? 'LIMITE_DE_CONSULTAS' : 'PLATAFORMA_NO_DISPONIBLE';
        if (respuesta.error.tipo === 'FORMATO')
          return err(inesperado(`${url}: ${respuesta.error.detalle}`));
        return err(new ErrorPlataforma(PLATAFORMA, codigo, `${url}: ${respuesta.error.tipo}`));
      }
      const { estado, cuerpo } = respuesta.value;
      if (estado === ESTADO_DE_BLOQUEO) return err(bloqueo(url));
      if (estado === 404 && esquemaError.safeParse(cuerpo).success) return ok([]);
      if (estado !== 200) return err(inesperado(`${url}: HTTP ${estado}`));

      const lista = esquemaDocumentos.safeParse(cuerpo);
      if (!lista.success) return err(inesperado(`${url}: ${lista.error.message.slice(0, 500)}`));
      return ok(
        lista.data.map((documento) => ({
          idExterno: documento.idRegDocumento,
          nombre: limpiarTexto(documento.nombre) ?? `Documento ${documento.idRegDocumento}`,
          fechaCarga: documento.fechaCarga,
          urlOrigen: `${base}/Descarga/DocumentoActuacion/${documento.idRegDocumento}`,
        })),
      );
    },

    async descargar(idDocumento, tamanoMaximo, ctx) {
      const url = `${base}/Descarga/DocumentoActuacion/${encodeURIComponent(idDocumento)}`;
      const respuesta = await opciones.http.obtenerBinario(url, tamanoMaximo, ctx.signal);
      if (!respuesta.ok) {
        switch (respuesta.error.tipo) {
          case 'DEMASIADO_GRANDE':
            return err('DEMASIADO_GRANDE');
          case 'LIMITE':
            return err(new ErrorPlataforma(PLATAFORMA, 'LIMITE_DE_CONSULTAS', url));
          case 'CANCELADO':
          case 'FORMATO':
          case 'NO_DISPONIBLE':
            return err(
              new ErrorPlataforma(
                PLATAFORMA,
                'PLATAFORMA_NO_DISPONIBLE',
                `${url}: ${respuesta.error.tipo}`,
              ),
            );
        }
      }
      const { estado, contenido, tipo } = respuesta.value;
      if (estado === ESTADO_DE_BLOQUEO) return err(bloqueo(url));
      if (estado === 404 || (estado === 200 && contenido.byteLength === 0)) {
        return err(
          new ErrorPlataforma(PLATAFORMA, 'NO_ENCONTRADO', `${url}: documento no disponible`),
        );
      }
      if (estado !== 200) return err(inesperado(`${url}: HTTP ${estado}`));
      return ok({ contenido, tipoDeclarado: tipo });
    },
  };
}
