import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { RepositorioDeDespachos } from '../application/puertos';

/**
 * Administración de despachos (superadmin). Usa el cliente sin aislamiento porque opera sobre
 * la tabla de tenants, nunca sobre datos de procesos.
 */
export function crearRepositorioDeDespachos(prisma: PrismaClient): RepositorioDeDespachos {
  const resumen = { id: true, nombre: true, estado: true } as const;

  return {
    async crear(nuevo) {
      try {
        const despacho = await prisma.despacho.create({ data: nuevo, select: resumen });
        return { despacho };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const campos = JSON.stringify(error.meta ?? {});
          return { duplicado: campos.includes('nit') ? 'nit' : 'slug' };
        }
        throw error;
      }
    },

    async listar() {
      const filas = await prisma.despacho.findMany({
        orderBy: { creadoEn: 'desc' },
        select: {
          ...resumen,
          slug: true,
          nit: true,
          creadoEn: true,
          _count: { select: { membresias: { where: { activa: true } } } },
        },
      });
      return filas.map(({ _count, ...despacho }) => ({
        ...despacho,
        miembrosActivos: _count.membresias,
      }));
    },

    buscar: (despachoId) =>
      prisma.despacho.findUnique({ where: { id: despachoId }, select: resumen }),

    async cambiarEstado(despachoId, estado) {
      await prisma.despacho.update({ where: { id: despachoId }, data: { estado } });
    },
  };
}
