import writeXlsxFile from 'write-excel-file/node';
import { connection } from 'next/server';
import {
  aCsv,
  ENCABEZADOS_DE_EXPORTACION,
  filasDeExportacion,
  nombreDeArchivoDeExportacion,
} from '@/modules/plataformas/application/exportacion-de-consulta-masiva';
import { esquemaId } from '@/modules/usuarios/domain/esquemas';
import {
  casosDeUso,
  ipDeLaPeticion,
  registrarSiEsInesperado,
} from '../../../../_servidor/peticion';

/**
 * Exporta los resultados de una consulta masiva a Excel (`?formato=xlsx`, por defecto) o CSV
 * (§7). Exige sesión y que la consulta sea de la persona (o administrador). Si algo falla,
 * responde una página breve en lenguaje humano, sin códigos ni trazas (§10).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/consulta-masiva/[id]/exportar'>,
): Promise<Response> {
  await connection();
  const { id } = await params;
  const consultaId = esquemaId.safeParse(id);
  if (!consultaId.success) return paginaDeMensaje(404, 'No encontramos esa consulta masiva.');
  const formato = new URL(request.url).searchParams.get('formato') === 'csv' ? 'CSV' : 'XLSX';

  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) {
      if (sesion.error.codigo === 'NO_AUTENTICADO') {
        return Response.redirect(new URL('/iniciar-sesion', request.url), 303);
      }
      return paginaDeMensaje(403, sesion.error.mensajeUsuario);
    }
    const detalle = await casos.prepararExportacionDeConsultaMasiva(sesion.value, {
      id: consultaId.data,
      formato,
      ip: await ipDeLaPeticion(),
    });
    if (!detalle.ok) return paginaDeMensaje(404, detalle.error.mensajeUsuario);

    const filas = filasDeExportacion(detalle.value.items);
    const cabeceras = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (formato === 'CSV') {
      const nombre = nombreDeArchivoDeExportacion(detalle.value.lote.creadoEn, 'csv');
      return new Response(aCsv(filas), {
        headers: {
          ...cabeceras,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${nombre}"`,
        },
      });
    }

    const encabezado = ENCABEZADOS_DE_EXPORTACION.map((titulo) => ({
      value: titulo,
      fontWeight: 'bold' as const,
    }));
    const cuerpo = filas.map((fila) => fila.map((valor) => (valor === '' ? null : valor)));
    const libro = await writeXlsxFile([encabezado, ...cuerpo], {
      sheet: 'Consulta masiva',
      columns: [
        { width: 28 },
        { width: 10 },
        { width: 24 },
        { width: 24 },
        { width: 16 },
        { width: 22 },
        { width: 60 },
        { width: 12 },
        { width: 22 },
      ],
    }).toBuffer();
    const nombre = nombreDeArchivoDeExportacion(detalle.value.lote.creadoEn, 'xlsx');
    return new Response(new Uint8Array(libro), {
      headers: {
        ...cabeceras,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombre}"`,
      },
    });
  } catch (error) {
    const seguro = registrarSiEsInesperado(error, 'exportar-consulta-masiva');
    return paginaDeMensaje(
      500,
      `${seguro.mensajeUsuario} Código de ayuda: ${seguro.codigoDeAyuda}.`,
    );
  }
}

function paginaDeMensaje(estado: number, mensaje: string): Response {
  const seguro = mensaje.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LURIS</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><p>${seguro}</p><p><a href="/consulta-masiva">Volver a la consulta masiva</a></p></body></html>`,
    { status: estado, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
