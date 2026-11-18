import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { RepositorioDePendientes } from '../application/puertos';

/** Bandeja «Pendientes de tu confirmación». Todo pasa por el cliente aislado del despacho. */
export function crearRepositorioDePendientes(
  paraDespacho: (despachoId: string) => ClienteDeDespacho,
): RepositorioDePendientes {
  return {
    async abrirVencidos(despachoId, plataforma, identificador, antesDe) {
      const db = paraDespacho(despachoId);
      const conIdentificador =
        identificador === 'NUNC' ? { nunc: { not: null } } : { radicado: { not: null } };
      const vencidos = await db.proceso.findMany({
        where: {
          activo: true,
          ...conIdentificador,
          pendientes: { none: { plataforma, resueltoEn: null } },
          plataformas: { none: { plataforma, ultimaSincronizacionEn: { gte: antesDe } } },
        },
        select: { id: true },
      });
      if (vencidos.length === 0) return 0;
      const creados = await db.pendienteDeConfirmacion.createMany({
        data: vencidos.map((p) => ({
          despachoId,
          procesoId: p.id,
          plataforma,
          origen: 'PROGRAMADA' as const,
        })),
        // Otro pendiente pudo abrirse entre la lectura y esta escritura (uno abierto por proceso).
        skipDuplicates: true,
      });
      return creados.count;
    },

    async abrirDeConsultaMasiva(despachoId, pendientes) {
      if (pendientes.length === 0) return 0;
      const creados = await paraDespacho(despachoId).pendienteDeConfirmacion.createMany({
        data: pendientes.map((p) => ({
          despachoId,
          procesoId: p.procesoId,
          plataforma: p.plataforma,
          origen: 'MASIVA' as const,
        })),
        // Si ya hay uno abierto (programado u otra consulta masiva), se conserva.
        skipDuplicates: true,
      });
      return creados.count;
    },

    async resolver(despachoId, procesoId, plataforma, ahora) {
      await paraDespacho(despachoId).pendienteDeConfirmacion.updateMany({
        where: { procesoId, plataforma, resueltoEn: null },
        data: { resueltoEn: ahora },
      });
    },

    async listar(despachoId, alcance) {
      const filas = await paraDespacho(despachoId).pendienteDeConfirmacion.findMany({
        where: {
          resueltoEn: null,
          proceso: {
            activo: true,
            ...(alcance.tipo === 'PARTICIPANTE' && {
              asignaciones: { some: { membresiaId: alcance.membresiaId } },
            }),
          },
        },
        orderBy: { creadoEn: 'asc' },
        take: 500,
        select: {
          id: true,
          procesoId: true,
          plataforma: true,
          origen: true,
          creadoEn: true,
          proceso: {
            select: {
              alias: true,
              cliente: true,
              radicado: true,
              nunc: true,
              plataformas: { select: { plataforma: true, ultimaSincronizacionEn: true } },
            },
          },
        },
      });
      return filas.map(({ proceso, ...pendiente }) => ({
        ...pendiente,
        alias: proceso.alias,
        cliente: proceso.cliente,
        radicado: proceso.radicado,
        nunc: proceso.nunc,
        ultimaConsultaEn:
          proceso.plataformas.find((p) => p.plataforma === pendiente.plataforma)
            ?.ultimaSincronizacionEn ?? null,
      }));
    },
  };
}
