import { connection } from 'next/server';
import { casosDeUso, registrarSiEsInesperado } from '../../../_servidor/peticion';

/**
 * Sirve un documento descargado (§8). Nunca por URL pública: exige sesión y que la persona pueda
 * ver el proceso del documento. `?descargar=1` lo entrega como descarga; si no, para verlo en
 * línea (solo PDF e imágenes; el resto siempre se descarga).
 *
 * Si algo falla, responde con una página breve en lenguaje humano, sin códigos ni trazas (§10).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/documentos/[documentoId]'>,
): Promise<Response> {
  await connection();
  const { documentoId } = await params;
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) {
      if (sesion.error.codigo === 'NO_AUTENTICADO') {
        return Response.redirect(new URL('/iniciar-sesion', request.url), 303);
      }
      return paginaDeMensaje(403, sesion.error.mensajeUsuario);
    }

    const documento = await casos.abrirDocumento(sesion.value, documentoId);
    if (!documento.ok) return paginaDeMensaje(404, documento.error.mensajeUsuario);
    const contenido = await documento.value.leer();
    if (!contenido) {
      return paginaDeMensaje(
        404,
        'Este documento ya no está guardado en LURIS. Vuelve a la ficha del proceso y consulta de nuevo la plataforma.',
      );
    }

    const { nombre, tipo, tamanoBytes } = documento.value;
    const descargar = new URL(request.url).searchParams.get('descargar') === '1';
    const disposicion = descargar || !tipo.visibleEnLinea ? 'attachment' : 'inline';
    return new Response(contenido, {
      headers: {
        'Content-Type': tipo.mime,
        'Content-Length': String(tamanoBytes),
        'Content-Disposition': `${disposicion}; ${nombreDeArchivo(nombre)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        // Solo LURIS puede mostrarlo dentro de una página (el visor de la ficha).
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    const seguro = registrarSiEsInesperado(error, 'abrir-documento');
    return paginaDeMensaje(
      500,
      `${seguro.mensajeUsuario} Código de ayuda: ${seguro.codigoDeAyuda}.`,
    );
  }
}

/** `filename` en ASCII para navegadores viejos y `filename*` con el nombre real (RFC 6266). */
function nombreDeArchivo(nombre: string): string {
  const ascii = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Página mínima con el mensaje y un camino de vuelta (si alguien abre el enlace directo). */
function paginaDeMensaje(estado: number, mensaje: string): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Documento no disponible · LURIS</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1rem;color:#1b2233;background:#f5f6f8}a{color:#2b4a94}@media (prefers-color-scheme:dark){body{color:#e6e9f0;background:#0f1524}a{color:#93abe8}}</style></head><body><h1 style="font-size:1.25rem">Documento no disponible</h1><p>${escaparHtml(mensaje)}</p><p><a href="/procesos">Ir a los procesos</a></p></body></html>`;
  return new Response(html, {
    status: estado,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
