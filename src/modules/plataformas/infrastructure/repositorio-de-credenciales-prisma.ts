import { Prisma } from '@/generated/prisma/client';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { CredencialCifrada, RepositorioDeCredenciales } from '../application/puertos';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECCION_CIFRADA = {
  id: true,
  despachoId: true,
  plataforma: true,
  alcance: true,
  membresiaId: true,
  usuario: true,
  secretoCifrado: true,
  versionClave: true,
  sesionCifrada: true,
  sesionVersionClave: true,
  codigoSolicitadoEn: true,
} as const;

function aCredencialCifrada(fila: {
  id: string;
  despachoId: string;
  plataforma: CredencialCifrada['plataforma'];
  alcance: CredencialCifrada['alcance'];
  membresiaId: string;
  usuario: string;
  secretoCifrado: Uint8Array;
  versionClave: number;
  sesionCifrada: Uint8Array | null;
  sesionVersionClave: number | null;
  codigoSolicitadoEn: Date | null;
}): CredencialCifrada {
  const { secretoCifrado, versionClave, sesionCifrada, sesionVersionClave, ...credencial } = fila;
  return {
    ...credencial,
    secreto: { datos: secretoCifrado, version: versionClave },
    sesion:
      sesionCifrada && sesionVersionClave !== null
        ? { datos: sesionCifrada, version: sesionVersionClave }
        : null,
  };
}

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
          codigoSolicitadoEn: true,
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
        select: SELECCION_CIFRADA,
      });
      return fila ? aCredencialCifrada(fila) : null;
    },

    async paraProceso(despachoId, procesoId, plataforma) {
      if (!FORMATO_UUID.test(procesoId)) return [];
      const db = paraDespacho(despachoId);
      // Personas asignadas al proceso con la membresía activa: responsable primero.
      const asignaciones = await db.asignacionProceso.findMany({
        where: { procesoId, membresia: { activa: true } },
        select: { membresiaId: true, tipo: true },
      });
      const orden = new Map(
        [...asignaciones]
          .sort((a, b) => Number(b.tipo === 'RESPONSABLE') - Number(a.tipo === 'RESPONSABLE'))
          .map((a, i) => [a.membresiaId, i]),
      );
      const filas = await db.credencialPlataforma.findMany({
        where: {
          plataforma,
          OR: [
            { alcance: 'PERSONAL', membresiaId: { in: [...orden.keys()] } },
            // La del despacho sigue sirviendo aunque quien la registró ya no esté.
            { alcance: 'DESPACHO' },
          ],
        },
        select: SELECCION_CIFRADA,
      });
      const posicion = (fila: (typeof filas)[number]) =>
        fila.alcance === 'DESPACHO' ? Number.MAX_SAFE_INTEGER : (orden.get(fila.membresiaId) ?? 0);
      return filas.sort((a, b) => posicion(a) - posicion(b)).map(aCredencialCifrada);
    },

    async guardarSesion(despachoId, id, sesion, ahora) {
      await paraDespacho(despachoId).credencialPlataforma.updateMany({
        where: { id },
        data: sesion
          ? {
              sesionCifrada: new Uint8Array(sesion.datos),
              sesionVersionClave: sesion.version,
              sesionGuardadaEn: ahora,
            }
          : { sesionCifrada: null, sesionVersionClave: null, sesionGuardadaEn: null },
      });
    },

    async marcarCodigoSolicitado(despachoId, id, en) {
      await paraDespacho(despachoId).credencialPlataforma.updateMany({
        where: { id },
        data: { codigoSolicitadoEn: en },
      });
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
        // Una contraseña nueva invalida la sesión guardada y cualquier código pendiente.
        sesionCifrada: null,
        sesionVersionClave: null,
        sesionGuardadaEn: null,
        codigoSolicitadoEn: null,
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
