import type { PrismaClient } from '@/generated/prisma/client';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import { SESION_SIN_VINCULAR, type RepositorioDeSesionDeWhatsapp } from '../application/puertos';

/**
 * Persistencia de la sesión de WhatsApp del despacho (§9). Las credenciales, las claves y el QR
 * se guardan cifrados (AES-256-GCM): aquí solo se leen y escriben como bytes opacos.
 */
export function crearRepositorioDeSesionDeWhatsapp(baseDeDatos: {
  readonly paraDespacho: (despachoId: string) => ClienteDeDespacho;
  readonly sinAislamiento: PrismaClient;
}): RepositorioDeSesionDeWhatsapp {
  const { paraDespacho, sinAislamiento } = baseDeDatos;

  return {
    async obtener(despachoId) {
      const fila = await paraDespacho(despachoId).sesionWhatsapp.findFirst({
        select: {
          estado: true,
          numero: true,
          qrCifrado: true,
          qrVersionClave: true,
          qrGeneradoEn: true,
          vinculacionSolicitadaEn: true,
          conectadaEn: true,
        },
      });
      if (!fila) return SESION_SIN_VINCULAR;
      return {
        estado: fila.estado,
        numero: fila.numero,
        qr:
          fila.qrCifrado && fila.qrVersionClave !== null
            ? { datos: new Uint8Array(fila.qrCifrado), version: fila.qrVersionClave }
            : null,
        qrGeneradoEn: fila.qrGeneradoEn,
        vinculacionSolicitadaEn: fila.vinculacionSolicitadaEn,
        conectadaEn: fila.conectadaEn,
      };
    },

    async solicitarVinculacion(despachoId, ahora) {
      await paraDespacho(despachoId).sesionWhatsapp.upsert({
        where: { despachoId },
        create: { despachoId, estado: 'VINCULANDO', vinculacionSolicitadaEn: ahora },
        update: {
          estado: 'VINCULANDO',
          vinculacionSolicitadaEn: ahora,
          qrCifrado: null,
          qrVersionClave: null,
          qrGeneradoEn: null,
        },
      });
    },

    async actualizar(despachoId, cambios) {
      const { qr, ...resto } = cambios;
      const datos = {
        ...resto,
        ...(qr !== undefined && {
          qrCifrado: qr ? Buffer.from(qr.datos) : null,
          qrVersionClave: qr ? qr.version : null,
        }),
      };
      await paraDespacho(despachoId).sesionWhatsapp.upsert({
        where: { despachoId },
        create: { despachoId, ...datos },
        update: datos,
      });
    },

    async cargarDatos(despachoId) {
      const fila = await paraDespacho(despachoId).sesionWhatsapp.findFirst({
        select: { datosCifrados: true, versionClave: true },
      });
      return fila?.datosCifrados && fila.versionClave !== null
        ? { datos: new Uint8Array(fila.datosCifrados), version: fila.versionClave }
        : null;
    },

    async guardarDatos(despachoId, datos) {
      await paraDespacho(despachoId).sesionWhatsapp.upsert({
        where: { despachoId },
        create: {
          despachoId,
          datosCifrados: Buffer.from(datos.datos),
          versionClave: datos.version,
        },
        update: { datosCifrados: Buffer.from(datos.datos), versionClave: datos.version },
      });
    },

    async reiniciar(despachoId) {
      await paraDespacho(despachoId).sesionWhatsapp.deleteMany({});
    },

    async despachosConSesion() {
      const filas = await sinAislamiento.sesionWhatsapp.findMany({
        where: { datosCifrados: { not: null }, despacho: { estado: 'ACTIVO' } },
        select: { despachoId: true },
      });
      return filas.map((f) => f.despachoId);
    },
  };
}
