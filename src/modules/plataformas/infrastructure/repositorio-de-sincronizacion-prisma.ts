import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { fechaOficialComoDate } from '@/shared/domain/fechas';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { RepositorioDeSincronizacion } from '../application/puertos';
import { claveDeDeduplicacion } from '../domain/actuaciones';
import { aDatosGuardados } from './datos-de-proceso';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persistencia de la sincronización. Todo dato de negocio pasa por el cliente aislado del
 * despacho; solo la lista de despachos activos (para la sincronización programada) usa el
 * acceso sin aislamiento, y no lee datos de procesos.
 */
export function crearRepositorioDeSincronizacion(baseDeDatos: {
  readonly paraDespacho: (despachoId: string) => ClienteDeDespacho;
  readonly sinAislamiento: PrismaClient;
}): RepositorioDeSincronizacion {
  const { paraDespacho, sinAislamiento } = baseDeDatos;

  return {
    async obtenerProceso(despachoId, procesoId) {
      if (!FORMATO_UUID.test(procesoId)) return null;
      return paraDespacho(despachoId).proceso.findUnique({
        where: { id: procesoId },
        select: { id: true, radicado: true, nunc: true },
      });
    },

    async estadoPrevio(despachoId, procesoId, plataforma) {
      const registro = await paraDespacho(despachoId).procesoPlataforma.findUnique({
        where: { procesoId_plataforma: { procesoId, plataforma } },
        select: {
          ultimaSincronizacionEn: true,
          actuaciones: { select: { claveDeduplicacion: true } },
        },
      });
      return {
        yaSincronizado: registro?.ultimaSincronizacionEn != null,
        claves: new Set(registro?.actuaciones.map((a) => a.claveDeduplicacion) ?? []),
      };
    },

    async guardarResultado(despachoId, procesoId, { resultado, nuevas, cargaInicial, ahora }) {
      const db = paraDespacho(despachoId);
      return db.$transaction(
        async (tx) => {
          const datos = {
            idExterno: resultado.expedientes[0]?.idExterno ?? null,
            datosProceso: aDatosGuardados(resultado),
            ultimaSincronizacionEn: ahora,
            ultimaConsultaEn: ahora,
            estadoUltimaConsulta: 'EXITOSA' as const,
          };
          const registro = await tx.procesoPlataforma.upsert({
            where: { procesoId_plataforma: { procesoId, plataforma: resultado.plataforma } },
            create: { despachoId, procesoId, plataforma: resultado.plataforma, ...datos },
            update: datos,
            select: { id: true },
          });
          // Las actuaciones de Tyba que ya estaban guardadas (de consultas anteriores a la marca de
          // origen) se marcan ahora, sin duplicarlas.
          const clavesPorOrigen = new Map<string, string[]>();
          for (const a of resultado.actuaciones) {
            if (!a.origen) continue;
            clavesPorOrigen.set(a.origen, [
              ...(clavesPorOrigen.get(a.origen) ?? []),
              claveDeDeduplicacion(a),
            ]);
          }
          for (const [origen, claves] of clavesPorOrigen) {
            await tx.actuacion.updateMany({
              where: {
                procesoPlataformaId: registro.id,
                origen: null,
                claveDeduplicacion: { in: claves },
              },
              data: { origen: origen as 'TYBA' },
            });
          }
          if (nuevas.length === 0) return [];

          const creadas = await tx.actuacion.createManyAndReturn({
            data: nuevas.map((a) => ({
              despachoId,
              procesoPlataformaId: registro.id,
              idExterno: a.idExterno,
              claveDeduplicacion: a.clave,
              fechaActuacion: fechaOficialComoDate(a.fechaActuacion),
              fechaRegistro: a.fechaRegistro ? fechaOficialComoDate(a.fechaRegistro) : null,
              descripcion: a.descripcion,
              anotacion: a.anotacion,
              despachoJudicial: a.despachoJudicial?.slice(0, 200) ?? null,
              terminoInicia: a.terminoInicia ? fechaOficialComoDate(a.terminoInicia) : null,
              terminoVence: a.terminoVence ? fechaOficialComoDate(a.terminoVence) : null,
              tieneDocumentos: a.tieneDocumentos,
              origen: a.origen ?? null,
              cargaInicial,
              detectadaEn: ahora,
            })),
            // Otra sincronización pudo guardar alguna entre la lectura y esta escritura.
            skipDuplicates: true,
            select: { id: true, claveDeduplicacion: true, tieneDocumentos: true },
          });
          return creadas.map(({ claveDeduplicacion, ...a }) => ({
            ...a,
            clave: claveDeduplicacion,
          }));
        },
        { timeout: 30_000 },
      );
    },

    async registrarFallo(despachoId, procesoId, plataforma, codigo, ahora) {
      try {
        await paraDespacho(despachoId).procesoPlataforma.upsert({
          where: { procesoId_plataforma: { procesoId, plataforma } },
          create: {
            despachoId,
            procesoId,
            plataforma,
            ultimaConsultaEn: ahora,
            estadoUltimaConsulta: codigo,
          },
          update: { ultimaConsultaEn: ahora, estadoUltimaConsulta: codigo },
          select: { id: true },
        });
      } catch (error) {
        // El proceso se borró mientras se consultaba: no hay nada que registrar.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return;
        throw error;
      }
    },

    async despachosActivos() {
      const despachos = await sinAislamiento.despacho.findMany({
        where: { estado: 'ACTIVO' },
        select: { id: true },
        orderBy: { creadoEn: 'asc' },
      });
      return despachos.map((d) => d.id);
    },

    async procesosActivos(despachoId) {
      return paraDespacho(despachoId).proceso.findMany({
        where: { activo: true },
        select: { id: true, radicado: true, nunc: true },
        orderBy: { creadoEn: 'asc' },
      });
    },
  };
}
