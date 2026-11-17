import { load } from 'cheerio';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { type CodigoErrorPlataforma, ErrorPlataforma } from '../../domain/errores';
import type { PlataformaJudicial } from '../../domain/puertos';
import type { ClienteHttp, FalloHttp } from '../http/cliente-http';
import {
  aResultadoConsulta,
  esLaMismaNoticia,
  leerFechaSpoa,
  type RegistroSpoa,
  valorSpoa,
} from './registro-spoa';

/**
 * Adaptador automático del SPOA por el servicio oficial de interoperabilidad de la Fiscalía
 * (§6). **Inactivo**: se activa solo cuando la Fiscalía conceda el acceso (ver
 * docs/solicitudes/fiscalia-spoa-interoperabilidad.md) y se configuren SPOA_INTEROPERABILIDAD_URL
 * y SPOA_INTEROPERABILIDAD_TOKEN. Entonces el SPOA pasa a consultarse solo, como la CPNU, sin
 * tocar los casos de uso.
 *
 * Supone que el servicio oficial entrega el mismo contrato de datos que hoy usa el portal
 * público (`RespuestaConsulta` → `DatosRespuesta` → `RegistroNumero`, en XML). Si el contrato
 * oficial es otro, solo cambian `leerRespuestaSpoa` y la URL.
 *
 * Nunca debe apuntarse al servicio interno del portal público: este se protege con un reto
 * (CAPTCHA) que se resuelve en el navegador, y consultarlo sin resolverlo sería evadirlo.
 */

const PLATAFORMA = 'SPOA';

export function crearPlataformaSpoaOficial(opciones: {
  /** URL del servicio oficial; el NUNC se agrega al final. */
  readonly urlServicio: string;
  /** Cliente HTTP con la credencial del servicio en sus cabeceras. */
  readonly http: ClienteHttp;
  readonly logger: Logger;
}): PlataformaJudicial {
  const base = opciones.urlServicio.replace(/\/+$/, '');
  const logger = opciones.logger.child({ plataforma: PLATAFORMA });

  function fallo(codigo: CodigoErrorPlataforma, detalle: string): ErrorPlataforma {
    if (codigo === 'RESPUESTA_INESPERADA')
      logger.error('Respuesta inesperada del SPOA', { detalle });
    return new ErrorPlataforma(PLATAFORMA, codigo, detalle);
  }

  function falloDeRed(f: FalloHttp, url: string): ErrorPlataforma {
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

  return {
    codigo: PLATAFORMA,
    identificador: 'NUNC',

    async consultar(nunc, ctx) {
      const url = `${base}/${encodeURIComponent(nunc)}`;
      const respuesta = await opciones.http.obtenerTexto(url, ctx.signal);
      if (!respuesta.ok) return err(falloDeRed(respuesta.error, url));
      const { estado, texto } = respuesta.value;
      if (estado === 401 || estado === 403) {
        return err(fallo('CREDENCIALES_INVALIDAS', `${url}: HTTP ${estado}`));
      }
      if (estado === 404) return err(fallo('NO_ENCONTRADO', `${url}: HTTP 404`));
      if (estado !== 200) return err(fallo('RESPUESTA_INESPERADA', `${url}: HTTP ${estado}`));

      const registro = leerRespuestaSpoa(texto);
      if (!registro.ok) return err(fallo('RESPUESTA_INESPERADA', `${url}: ${registro.error}`));
      if (!registro.value) return err(fallo('NO_ENCONTRADO', `${url}: sin registro`));
      if (!esLaMismaNoticia(nunc, registro.value.noticia)) {
        return err(fallo('RESPUESTA_INESPERADA', `${url}: devolvió ${registro.value.noticia}`));
      }
      return ok(aResultadoConsulta(registro.value));
    },
  };
}

/** Pares «a#b|c#d» del SPOA (actuaciones: fecha#nombre; delitos: delito#grado). */
function pares(texto: string | null): [string, string | null][] {
  if (!texto) return [];
  return texto
    .split('|')
    .map((parte) => {
      const [a = '', b] = parte.split('#');
      return [a.trim(), valorSpoa(b)] as [string, string | null];
    })
    .filter(([a]) => a !== '');
}

/**
 * Lee la respuesta XML (`RespuestaConsulta`, a veces escapada dentro de un elemento `return` de
 * SOAP). Devuelve null si no trae registro (noticia inexistente o reservada).
 */
export function leerRespuestaSpoa(xml: string): Result<RegistroSpoa | null, string> {
  let $ = load(xml, { xml: true });
  const envuelto = $('return').first().text();
  if (envuelto.includes('<RespuestaConsulta')) $ = load(envuelto, { xml: true });
  if ($('RespuestaConsulta').length === 0) return err('sin RespuestaConsulta');

  const registro = $('RespuestaConsulta DatosRespuesta RegistroNumero').first();
  if (registro.length === 0) return ok(null);
  const campo = (etiqueta: string) => valorSpoa(registro.children(etiqueta).first().text());

  const noticia = (campo('CASO_NOTICIA') ?? '').replace(/\D/g, '');
  if (noticia.length !== 21 && noticia.length !== 23) return ok(null);

  const actuaciones = pares(campo('ACTUACIONES')).flatMap(([fecha, nombre]) => {
    const dia = leerFechaSpoa(fecha);
    return dia && nombre ? [{ fecha: dia, nombre }] : [];
  });
  return ok({
    noticia,
    estado: campo('CASO_ESTADO'),
    etapa: campo('CASO_ETAPA'),
    ley: campo('CASO_LEY'),
    departamentoHechos: campo('CASO_DEPA_HECHO'),
    municipioHechos: campo('CASO_MUNI_HECHO'),
    fechaHechos: leerFechaSpoa(campo('CASO_FECHA_HECHOS')),
    seccional: campo('UNID_SECCIONAL'),
    unidad: campo('UNID_DESCRIPCION'),
    despacho: campo('DESPACHO'),
    fechaAsignacion: leerFechaSpoa(campo('FECHA_ASIGNACION')),
    departamentoDespacho: campo('CASO_DEPA_UNID'),
    municipioDespacho: campo('CASO_MUNI_UNID'),
    direccion: campo('UNID_DIRECCION'),
    correo: campo('DESP_CORREO'),
    telefonos: campo('UNID_TELEFONO'),
    delitos: pares(campo('DELITOS')).map(([delito, grado]) => ({ delito, grado })),
    actuaciones,
  });
}
