import { load } from 'cheerio';
import { err, ok } from '@/shared/domain/result';
import { type CodigoErrorPlataforma, ErrorPlataforma } from '../../domain/errores';
import type { VerificadorDeAcceso } from '../../domain/puertos';
import type { FalloHttp } from '../http/cliente-http';
import type { PaginaWeb, SesionWeb } from '../http/sesion-web';

/**
 * Prueba el acceso a SAMAI con el usuario y contraseña de un abogado (ingreso «con usuario y
 * contraseña» de su página /Login.aspx, para usuarios externos). Si SAMAI pide un reto, no lo
 * resuelve: responde REQUIERE_INTERVENCION.
 *
 * El secreto solo viaja en el formulario hacia SAMAI; nunca se registra.
 */

const PLATAFORMA = 'SAMAI';
const CAMPO_USUARIO = 'ctl00$MainContent$UserNames';
const CAMPO_CLAVE = 'ctl00$MainContent$Password';
const BOTON = 'ctl00$MainContent$BtnIngresar';

function pideReto(html: string): boolean {
  return /no soy un robot|recaptcha|g-recaptcha|captcha/i.test(html);
}

function tieneFormularioDeIngreso(html: string): boolean {
  return load(html)(`input[name="${CAMPO_USUARIO}"]`).length > 0;
}

export function crearVerificadorSamai(opciones: {
  readonly urlBase: string;
  /** Una sesión nueva por verificación (cookies propias). */
  readonly crearSesion: () => SesionWeb;
}): VerificadorDeAcceso {
  const base = opciones.urlBase.replace(/\/+$/, '');

  function fallo(codigo: CodigoErrorPlataforma, detalle: string) {
    return err(new ErrorPlataforma(PLATAFORMA, codigo, detalle));
  }

  function falloDeRed(f: FalloHttp) {
    return fallo(
      f.tipo === 'LIMITE'
        ? 'LIMITE_DE_CONSULTAS'
        : f.tipo === 'FORMATO'
          ? 'RESPUESTA_INESPERADA'
          : 'PLATAFORMA_NO_DISPONIBLE',
      `ingreso a SAMAI: ${f.tipo}`,
    );
  }

  return {
    plataforma: PLATAFORMA,

    async verificar(usuario, secreto, ctx) {
      const sesion = opciones.crearSesion();
      const ingreso = await sesion.obtener(`${base}/Login.aspx`, ctx.signal);
      if (!ingreso.ok) return falloDeRed(ingreso.error);
      if (ingreso.value.estado !== 200 || !tieneFormularioDeIngreso(ingreso.value.html)) {
        return fallo(
          'RESPUESTA_INESPERADA',
          `ingreso a SAMAI: HTTP ${ingreso.value.estado} sin formulario`,
        );
      }
      if (pideReto(ingreso.value.html))
        return fallo('REQUIERE_INTERVENCION', 'SAMAI pide un reto al ingresar');

      const formulario = camposDelFormulario(ingreso.value);
      // La contraseña solo se envía al propio SAMAI, nunca a otro sitio.
      if (new URL(formulario.accion).host !== new URL(base).host) {
        return fallo(
          'RESPUESTA_INESPERADA',
          `el formulario de ingreso apunta a ${formulario.accion}`,
        );
      }
      const respuesta = await sesion.enviarFormulario(
        formulario.accion,
        {
          ...formulario.campos,
          [CAMPO_USUARIO]: usuario,
          [CAMPO_CLAVE]: secreto,
          [BOTON]: 'Ingresar',
        },
        ctx.signal,
      );
      if (!respuesta.ok) return falloDeRed(respuesta.error);
      const { html, estado } = respuesta.value;
      if (estado >= 400) return fallo('RESPUESTA_INESPERADA', `ingreso a SAMAI: HTTP ${estado}`);
      // Si vuelve a mostrar el formulario de ingreso, no entró.
      if (tieneFormularioDeIngreso(html)) {
        return pideReto(html)
          ? fallo('REQUIERE_INTERVENCION', 'SAMAI pidió un reto tras el ingreso')
          : fallo('CREDENCIALES_INVALIDAS', 'SAMAI no aceptó el usuario o la contraseña');
      }
      return ok(undefined);
    },
  };
}

/** Campos ocultos del formulario (estado de ASP.NET) y a dónde se envía. */
function camposDelFormulario(pagina: PaginaWeb): {
  readonly accion: string;
  readonly campos: Record<string, string>;
} {
  const $ = load(pagina.html);
  const formulario = $('form').first();
  const campos: Record<string, string> = {};
  formulario.find('input[type="hidden"]').each((_, campo) => {
    const nombre = $(campo).attr('name');
    if (nombre) campos[nombre] = $(campo).attr('value') ?? '';
  });
  const accion = new URL(formulario.attr('action') ?? './Login.aspx', pagina.url).toString();
  return { accion, campos };
}
