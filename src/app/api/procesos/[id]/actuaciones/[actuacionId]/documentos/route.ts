import { connection } from 'next/server';
import { obtenerDependencias } from '@/composition-root';
import {
  casosDeUso,
  ipDeLaPeticion,
  registrarSiEsInesperado,
} from '../../../../../../_servidor/peticion';

/**
 * Sube a mano un documento a una actuación (Fase 7). Es una ruta y no una server action porque
 * los documentos pesan más que el límite de las acciones; por eso verifica a mano lo que una
 * acción trae incorporado: que la petición venga de la propia app (contra CSRF).
 *
 * Responde siempre JSON con un mensaje en lenguaje humano (§10); nunca códigos ni trazas.
 */
type Respuesta =
  | { readonly ok: true; readonly mensaje: string }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

const NO_SE_PUDO = 'No pudimos subir el documento. Recarga la página e inténtalo de nuevo.';

function responder(estado: number, cuerpo: Respuesta): Response {
  return Response.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } });
}

/** La petición viene de una página de LURIS (no de otro sitio con la sesión de la persona). */
function vieneDeLaApp(request: Request, urlDeLaApp: string): boolean {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio) return sitio === 'same-origin';
  const origen = request.headers.get('origin');
  return (
    origen !== null && [new URL(urlDeLaApp).origin, new URL(request.url).origin].includes(origen)
  );
}

export async function POST(
  request: Request,
  { params }: RouteContext<'/api/procesos/[id]/actuaciones/[actuacionId]/documentos'>,
): Promise<Response> {
  await connection();
  const { env } = obtenerDependencias('web');
  if (!vieneDeLaApp(request, env.APP_URL))
    return responder(403, { ok: false, mensaje: NO_SE_PUDO });

  const maximo = env.DOCUMENTO_TAMANO_MAXIMO_MB * 1024 * 1024;
  // El formulario agrega algo de sobrecarga al archivo.
  // Sin tamaño declarado no se lee el cuerpo: un envío «por trozos» podría llenar la memoria.
  const declarado = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declarado) || declarado <= 0 || declarado > maximo + 64 * 1024) {
    return responder(413, {
      ok: false,
      mensaje: `El archivo pesa más de ${env.DOCUMENTO_TAMANO_MAXIMO_MB} MB, el máximo permitido.`,
    });
  }

  const { id, actuacionId } = await params;
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return responder(401, { ok: false, mensaje: sesion.error.mensajeUsuario });

    const formulario = await request.formData().catch(() => null);
    const archivo = formulario?.get('archivo');
    if (!(archivo instanceof File)) {
      return responder(400, { ok: false, mensaje: 'Elige el documento que quieres agregar.' });
    }
    const resultado = await casos.agregarDocumento(sesion.value, {
      procesoId: id,
      actuacionId,
      nombre: archivo.name,
      contenido: new Uint8Array(await archivo.arrayBuffer()),
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) {
      const error = registrarSiEsInesperado(resultado.error, 'agregar-documento');
      return responder(400, { ok: false, mensaje: error.mensajeUsuario });
    }
    return responder(200, { ok: true, mensaje: `Documento agregado: ${resultado.value.nombre}.` });
  } catch (causa) {
    const error = registrarSiEsInesperado(causa, 'agregar-documento');
    return responder(500, {
      ok: false,
      mensaje: error.mensajeUsuario,
      codigoDeAyuda: error.codigoDeAyuda,
    });
  }
}
