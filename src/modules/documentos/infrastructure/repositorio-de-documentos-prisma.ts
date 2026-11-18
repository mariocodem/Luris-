import { fechaOficialComoDate } from '@/shared/domain/fechas';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { RepositorioDeDocumentos } from '../application/puertos';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Documentos de las actuaciones. Todo pasa por el cliente aislado del despacho. */
export function crearRepositorioDeDocumentos(
  paraDespacho: (despachoId: string) => ClienteDeDespacho,
): RepositorioDeDocumentos {
  return {
    async actuacionDeOrigen(despachoId, actuacionId) {
      if (!FORMATO_UUID.test(actuacionId)) return null;
      const actuacion = await paraDespacho(despachoId).actuacion.findUnique({
        where: { id: actuacionId },
        select: {
          idExterno: true,
          procesoPlataforma: { select: { plataforma: true, procesoId: true } },
        },
      });
      if (!actuacion) return null;
      return {
        plataforma: actuacion.procesoPlataforma.plataforma,
        idExterno: actuacion.idExterno,
        procesoId: actuacion.procesoPlataforma.procesoId,
      };
    },

    async registrarReferencias(despachoId, actuacionId, referencias) {
      if (referencias.length === 0) return;
      await paraDespacho(despachoId).documento.createMany({
        data: referencias.map((r) => ({
          despachoId,
          actuacionId,
          idExterno: r.idExterno,
          nombre: r.nombre.slice(0, 300),
          fechaCarga: r.fechaCarga ? fechaOficialComoDate(r.fechaCarga) : null,
          urlOrigen: r.urlOrigen,
        })),
        skipDuplicates: true,
      });
    },

    async pendientes(despachoId, actuacionId) {
      const documentos = await paraDespacho(despachoId).documento.findMany({
        where: { actuacionId, estado: { not: 'DESCARGADO' }, idExterno: { not: null } },
        select: { id: true, idExterno: true, nombre: true },
        orderBy: { creadoEn: 'asc' },
      });
      return documentos.flatMap((d) => (d.idExterno ? [{ ...d, idExterno: d.idExterno }] : []));
    },

    async marcarDescargado(despachoId, documentoId, archivo) {
      await paraDespacho(despachoId).documento.update({
        where: { id: documentoId },
        data: {
          estado: 'DESCARGADO',
          tipoMime: archivo.tipoMime,
          tamanoBytes: archivo.tamanoBytes,
          sha256: archivo.sha256,
          rutaAlmacenamiento: archivo.ruta,
          descargadoEn: archivo.ahora,
          ultimoIntentoEn: archivo.ahora,
          intentos: { increment: 1 },
        },
        select: { id: true },
      });
    },

    async marcarNoDisponible(despachoId, documentoId, ahora) {
      await paraDespacho(despachoId).documento.update({
        where: { id: documentoId },
        data: { estado: 'NO_DISPONIBLE', ultimoIntentoEn: ahora, intentos: { increment: 1 } },
        select: { id: true },
      });
    },

    async procesoDeLaActuacion(despachoId, actuacionId) {
      if (!FORMATO_UUID.test(actuacionId)) return null;
      const actuacion = await paraDespacho(despachoId).actuacion.findUnique({
        where: { id: actuacionId },
        select: { procesoPlataforma: { select: { procesoId: true } } },
      });
      return actuacion?.procesoPlataforma.procesoId ?? null;
    },

    async registrarSubido(despachoId, datos) {
      const db = paraDespacho(despachoId);
      return db.$transaction(async (tx) => {
        const documento = await tx.documento.create({
          data: {
            despachoId,
            actuacionId: datos.actuacionId,
            nombre: datos.nombre.slice(0, 300),
            estado: 'DESCARGADO',
            tipoMime: datos.tipoMime,
            tamanoBytes: datos.tamanoBytes,
            sha256: datos.sha256,
            rutaAlmacenamiento: datos.ruta,
            descargadoEn: datos.ahora,
            subidoPorId: datos.subidoPorId,
          },
          select: { id: true },
        });
        await tx.actuacion.update({
          where: { id: datos.actuacionId },
          data: { tieneDocumentos: true },
          select: { id: true },
        });
        return documento;
      });
    },

    async paraAbrir(despachoId, documentoId) {
      if (!FORMATO_UUID.test(documentoId)) return null;
      const documento = await paraDespacho(despachoId).documento.findUnique({
        where: { id: documentoId },
        select: {
          nombre: true,
          estado: true,
          tipoMime: true,
          tamanoBytes: true,
          rutaAlmacenamiento: true,
          actuacion: { select: { procesoPlataforma: { select: { procesoId: true } } } },
        },
      });
      if (
        documento?.estado !== 'DESCARGADO' ||
        !documento.tipoMime ||
        documento.tamanoBytes === null ||
        !documento.rutaAlmacenamiento
      ) {
        return null;
      }
      return {
        procesoId: documento.actuacion.procesoPlataforma.procesoId,
        nombre: documento.nombre,
        tipoMime: documento.tipoMime,
        tamanoBytes: documento.tamanoBytes,
        ruta: documento.rutaAlmacenamiento,
      };
    },
  };
}
