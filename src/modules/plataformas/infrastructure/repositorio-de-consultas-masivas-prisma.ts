import { Prisma } from '@/generated/prisma/client';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type {
  ItemDeConsultaMasiva,
  LoteDeConsultaMasiva,
  RepositorioDeConsultasMasivas,
} from '../application/puertos';
import { contarItems, esquemaResumenDeItem } from '../domain/consulta-masiva';

type Transaccion = Parameters<Parameters<ClienteDeDespacho['$transaction']>[0]>[0];

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_ABIERTOS = ['PENDIENTE', 'EN_PROCESO'] as const;

const SELECCION_DE_LOTE = {
  id: true,
  creadaPorId: true,
  estado: true,
  totalItems: true,
  iniciadaEn: true,
  finalizadaEn: true,
  creadoEn: true,
  creadaPor: { select: { usuario: { select: { nombre: true } } } },
} satisfies Prisma.ConsultaMasivaSelect;

function aLote(fila: {
  id: string;
  creadaPorId: string;
  estado: LoteDeConsultaMasiva['estado'];
  totalItems: number;
  iniciadaEn: Date | null;
  finalizadaEn: Date | null;
  creadoEn: Date;
  creadaPor: { usuario: { nombre: string } };
}): LoteDeConsultaMasiva {
  return {
    id: fila.id,
    creadaPorId: fila.creadaPorId,
    creadaPorNombre: fila.creadaPor.usuario.nombre,
    estado: fila.estado,
    totalProcesos: fila.totalItems,
    iniciadaEn: fila.iniciadaEn,
    finalizadaEn: fila.finalizadaEn,
    creadoEn: fila.creadoEn,
  };
}

/** Completa los lotes que ya no tienen ítems por consultar (lo asistido espera a la persona). */
async function cerrarLotesTerminados(
  tx: Transaccion,
  loteIds: readonly string[],
  ahora: Date,
): Promise<void> {
  for (const id of new Set(loteIds)) {
    const abiertos = await tx.itemConsultaMasiva.count({
      where: { consultaMasivaId: id, estado: { in: [...ESTADOS_ABIERTOS] } },
    });
    if (abiertos === 0) {
      await tx.consultaMasiva.updateMany({
        where: { id, estado: { in: ['PENDIENTE', 'EN_PROCESO'] } },
        data: { estado: 'COMPLETADA', finalizadaEn: ahora },
      });
    }
  }
}

/**
 * Persistencia de la consulta masiva. Todo pasa por el cliente aislado del despacho: un lote y
 * sus ítems nunca se ven desde otro despacho.
 */
export function crearRepositorioDeConsultasMasivas(
  paraDespacho: (despachoId: string) => ClienteDeDespacho,
): RepositorioDeConsultasMasivas {
  return {
    async procesosPorIdentificadores(despachoId, { radicados, nuncs }) {
      if (radicados.length === 0 && nuncs.length === 0) return [];
      return paraDespacho(despachoId).proceso.findMany({
        where: { OR: [{ radicado: { in: [...radicados] } }, { nunc: { in: [...nuncs] } }] },
        select: {
          id: true,
          radicado: true,
          nunc: true,
          activo: true,
          asignaciones: { select: { membresiaId: true, tipo: true } },
        },
      });
    },

    async crear(despachoId, { creadaPorId, ahora, totalProcesos, items }) {
      return paraDespacho(despachoId).$transaction(async (tx) => {
        const hayQueConsultar = items.some((i) => i.estado === 'PENDIENTE');
        const lote = await tx.consultaMasiva.create({
          data: {
            despachoId,
            creadaPorId,
            totalItems: totalProcesos,
            estado: hayQueConsultar ? 'EN_PROCESO' : 'COMPLETADA',
            iniciadaEn: ahora,
            finalizadaEn: hayQueConsultar ? null : ahora,
          },
          select: { id: true },
        });
        await tx.itemConsultaMasiva.createMany({
          data: items.map((i) => ({
            despachoId,
            consultaMasivaId: lote.id,
            tipoIdentificador: i.tipo,
            identificador: i.identificador,
            procesoId: i.procesoId,
            plataforma: i.plataforma,
            estado: i.estado,
          })),
        });
        return { id: lote.id };
      });
    },

    async buscar(despachoId, id) {
      if (!FORMATO_UUID.test(id)) return null;
      const fila = await paraDespacho(despachoId).consultaMasiva.findUnique({
        where: { id },
        select: SELECCION_DE_LOTE,
      });
      return fila ? aLote(fila) : null;
    },

    async listar(despachoId, { creadaPorId }, limite) {
      const filas = await paraDespacho(despachoId).consultaMasiva.findMany({
        where: creadaPorId ? { creadaPorId } : {},
        orderBy: { creadoEn: 'desc' },
        take: limite,
        select: { ...SELECCION_DE_LOTE, items: { select: { estado: true } } },
      });
      return filas.map(({ items, ...fila }) => ({
        ...aLote(fila),
        conteo: contarItems(items.map((i) => i.estado)),
      }));
    },

    async items(despachoId, id) {
      const filas = await paraDespacho(despachoId).itemConsultaMasiva.findMany({
        where: { consultaMasivaId: id },
        orderBy: [{ identificador: 'asc' }, { plataforma: 'asc' }],
        select: {
          id: true,
          tipoIdentificador: true,
          identificador: true,
          procesoId: true,
          plataforma: true,
          estado: true,
          resultado: true,
          resumen: true,
          actualizadoEn: true,
          proceso: { select: { alias: true, cliente: true } },
        },
      });
      return filas.map((fila): ItemDeConsultaMasiva => {
        const resumen = esquemaResumenDeItem.safeParse(fila.resumen);
        return {
          id: fila.id,
          tipo: fila.tipoIdentificador,
          identificador: fila.identificador,
          procesoId: fila.procesoId,
          alias: fila.proceso?.alias ?? null,
          cliente: fila.proceso?.cliente ?? null,
          plataforma: fila.plataforma,
          estado: fila.estado,
          resultado: fila.resultado,
          resumen: resumen.success ? resumen.data : null,
          actualizadoEn: fila.actualizadoEn,
        };
      });
    },

    async conteo(despachoId, id) {
      const filas = await paraDespacho(despachoId).itemConsultaMasiva.findMany({
        where: { consultaMasivaId: id },
        select: { estado: true },
      });
      return contarItems(filas.map((f) => f.estado));
    },

    async registrarResultado(despachoId, { procesoId, plataforma, resultado, ahora }) {
      return paraDespacho(despachoId).$transaction(async (tx) => {
        const abiertos = await tx.itemConsultaMasiva.findMany({
          where: { procesoId, plataforma, estado: { in: [...ESTADOS_ABIERTOS] } },
          select: { id: true, consultaMasivaId: true },
        });
        if (abiertos.length === 0) return 0;
        await tx.itemConsultaMasiva.updateMany({
          where: { id: { in: abiertos.map((a) => a.id) } },
          data: {
            estado: resultado.estado,
            resultado: resultado.resultado,
            resumen: resultado.resumen,
            intentos: { increment: 1 },
          },
        });
        if (resultado.estado !== 'EN_PROCESO') {
          await cerrarLotesTerminados(
            tx,
            abiertos.map((a) => a.consultaMasivaId),
            ahora,
          );
        }
        return abiertos.length;
      });
    },

    async resolverAsistidos(despachoId, { procesoId, plataforma, resumen }) {
      const resueltos = await paraDespacho(despachoId).itemConsultaMasiva.updateMany({
        where: { procesoId, plataforma, estado: 'PENDIENTE_CONFIRMACION' },
        data: { estado: 'COMPLETADO', resultado: 'EXITOSA', resumen },
      });
      return resueltos.count;
    },

    async reintentarFallidos(despachoId, id, itemId) {
      return paraDespacho(despachoId).$transaction(async (tx) => {
        const fallidos = await tx.itemConsultaMasiva.findMany({
          where: {
            consultaMasivaId: id,
            estado: 'FALLIDO',
            procesoId: { not: null },
            ...(itemId && { id: itemId }),
          },
          select: { id: true, procesoId: true, plataforma: true },
        });
        if (fallidos.length === 0) return [];
        await tx.itemConsultaMasiva.updateMany({
          where: { id: { in: fallidos.map((f) => f.id) } },
          data: { estado: 'PENDIENTE', resultado: null, resumen: Prisma.DbNull },
        });
        await tx.consultaMasiva.update({
          where: { id },
          data: { estado: 'EN_PROCESO', finalizadaEn: null },
        });
        return fallidos.flatMap((f) =>
          f.procesoId ? [{ despachoId, procesoId: f.procesoId, plataforma: f.plataforma }] : [],
        );
      });
    },
  };
}
