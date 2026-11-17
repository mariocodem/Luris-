import { Prisma } from '@/generated/prisma/client';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { RepositorioDeCredenciales } from '../application/puertos';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Credenciales de plataformas. Todo pasa por el cliente aislado del despacho. El secreto solo
 * sale de aquí cifrado (`buscar`), y solo lo pide el worker para usarlo.
 */
export function crearRepositorioDeCredenciales(
  paraDespacho: (despachoId: string) => ClienteDeDespacho,
): RepositorioDeCredenciales {
  return {
    async listar(despachoId, { membresiaId, incluirDelDespacho }) {
      const filas = await paraDespacho(despachoId).credencialPlataforma.findMany({
        where: {
          OR: [
            { alcance: 'PERSONAL', membresiaId },
            ...(incluirDelDespacho ? [{ alcance: 'DESPACHO' as const }] : []),
          ],
        },
        orderBy: [{ plataforma: 'asc' }, { alcance: 'asc' }],
        select: {
          id: true,
          plataforma: true,
          alcance: true,
          usuario: true,
          membresiaId: true,
          consentimientoEn: true,
          actualizadoEn: true,
          verificadaEn: true,
          estadoVerificacion: true,
          membresia: { select: { usuario: { select: { nombre: true } } } },
        },
      });
      return filas.map(({ membresia, ...credencial }) => ({
        ...credencial,
        titular: membresia.usuario.nombre,
      }));
    },

    async buscar(despachoId, id) {
      if (!FORMATO_UUID.test(id)) return null;
      const fila = await paraDespacho(despachoId).credencialPlataforma.findUnique({
        where: { id },
        select: {
          id: true,
          despachoId: true,
          plataforma: true,
          alcance: true,
          membresiaId: true,
          usuario: true,
          secretoCifrado: true,
          versionClave: true,
        },
      });
      if (!fila) return null;
      const { secretoCifrado, versionClave, ...credencial } = fila;
      return { ...credencial, secreto: { datos: secretoCifrado, version: versionClave } };
    },

    async guardar(despachoId, datos) {
      const db = paraDespacho(despachoId);
      const valores = {
        membresiaId: datos.membresiaId,
        usuario: datos.usuario,
        secretoCifrado: new Uint8Array(datos.secreto.datos),
        versionClave: datos.secreto.version,
        consentimientoEn: datos.consentimientoEn,
        verificadaEn: null,
        estadoVerificacion: null,
      };
      return db.$transaction(async (tx) => {
        // Una del despacho por plataforma; una personal por persona y plataforma (índices únicos).
        const existente = await tx.credencialPlataforma.findFirst({
          where:
            datos.alcance === 'DESPACHO'
              ? { plataforma: datos.plataforma, alcance: 'DESPACHO' }
              : {
                  plataforma: datos.plataforma,
                  alcance: 'PERSONAL',
                  membresiaId: datos.membresiaId,
                },
          select: { id: true },
        });
        if (existente) {
          return tx.credencialPlataforma.update({
            where: { id: existente.id },
            data: valores,
            select: { id: true },
          });
        }
        return tx.credencialPlataforma.create({
          data: { despachoId, plataforma: datos.plataforma, alcance: datos.alcance, ...valores },
          select: { id: true },
        });
      });
    },

    async eliminar(despachoId, id) {
      await paraDespacho(despachoId).credencialPlataforma.deleteMany({ where: { id } });
    },

    async registrarVerificacion(despachoId, id, estado, ahora) {
      try {
        await paraDespacho(despachoId).credencialPlataforma.update({
          where: { id },
          data: { verificadaEn: ahora, estadoVerificacion: estado },
          select: { id: true },
        });
      } catch (error) {
        // La borraron mientras se probaba: no hay nada que registrar.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return;
        throw error;
      }
    },
  };
}
