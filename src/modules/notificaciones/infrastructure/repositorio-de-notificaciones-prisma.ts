import type { Prisma } from '@/generated/prisma/client';
import { contarItems } from '@/modules/plataformas/domain/consulta-masiva';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { ActuacionAvisada } from '../domain/aviso';
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasDeNotificacion } from '../domain/preferencias';
import type {
  DestinatarioPosible,
  NotificacionDeLaPersona,
  NotificacionPorEnviar,
  RepositorioDeNotificaciones,
} from '../application/puertos';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECCION_DE_PREFERENCIAS = {
  correoActivo: true,
  whatsappActivo: true,
  numeroWhatsapp: true,
  consentimientoWhatsappEn: true,
  frecuencia: true,
} satisfies Prisma.PreferenciaNotificacionSelect;

type FilaDePreferencias = Prisma.PreferenciaNotificacionGetPayload<{
  select: typeof SELECCION_DE_PREFERENCIAS;
}>;

function aPreferencias(fila: FilaDePreferencias | null | undefined): PreferenciasDeNotificacion {
  return fila ?? PREFERENCIAS_POR_DEFECTO;
}

const SELECCION_DE_PERSONA = {
  usuario: { select: { nombre: true, email: true } },
  preferenciaNotificacion: { select: SELECCION_DE_PREFERENCIAS },
} satisfies Prisma.MembresiaSelect;

const SELECCION_DEL_AVISO = {
  id: true,
  membresiaId: true,
  canal: true,
  estado: true,
  intentos: true,
  codigoError: true,
  programadaPara: true,
  enviadaEn: true,
  destinatario: { select: SELECCION_DE_PERSONA },
  actuacion: {
    select: {
      id: true,
      fechaActuacion: true,
      fechaRegistro: true,
      descripcion: true,
      anotacion: true,
      tieneDocumentos: true,
      origen: true,
      procesoPlataforma: {
        select: {
          plataforma: true,
          proceso: {
            select: { id: true, alias: true, cliente: true, radicado: true, nunc: true },
          },
        },
      },
    },
  },
} satisfies Prisma.NotificacionSelect;

type FilaDeAviso = Prisma.NotificacionGetPayload<{ select: typeof SELECCION_DEL_AVISO }>;

function aActuacion(fila: FilaDeAviso): ActuacionAvisada {
  const { actuacion } = fila;
  return {
    id: actuacion.id,
    plataforma: actuacion.procesoPlataforma.plataforma,
    origen: actuacion.origen,
    fechaActuacion: actuacion.fechaActuacion,
    fechaRegistro: actuacion.fechaRegistro,
    descripcion: actuacion.descripcion,
    anotacion: actuacion.anotacion,
    tieneDocumentos: actuacion.tieneDocumentos,
  };
}

function aProceso(fila: FilaDeAviso) {
  const { proceso } = fila.actuacion.procesoPlataforma;
  return {
    procesoId: proceso.id,
    alias: proceso.alias,
    cliente: proceso.cliente,
    radicado: proceso.radicado,
    nunc: proceso.nunc,
  };
}

/**
 * Persistencia de las notificaciones (§9). Todo pasa por el cliente aislado del despacho: los
 * avisos y las preferencias de un despacho nunca se ven desde otro.
 */
export function crearRepositorioDeNotificaciones(
  paraDespacho: (despachoId: string) => ClienteDeDespacho,
): RepositorioDeNotificaciones {
  return {
    async destinatariosDeProceso(despachoId, procesoId) {
      if (!FORMATO_UUID.test(procesoId)) return [];
      const db = paraDespacho(despachoId);
      const asignadas = await db.asignacionProceso.findMany({
        where: { procesoId, membresia: { activa: true } },
        select: { membresiaId: true, membresia: { select: SELECCION_DE_PERSONA } },
      });
      const personas =
        asignadas.length > 0
          ? asignadas.map((a) => ({ id: a.membresiaId, ...a.membresia }))
          : // Sin nadie asignado, el aviso va a quienes administran el despacho.
            (
              await db.membresia.findMany({
                where: { rol: 'administrador', activa: true },
                select: { id: true, ...SELECCION_DE_PERSONA },
              })
            ).map((m) => m);
      return personas.map((p): DestinatarioPosible => ({
        membresiaId: p.id,
        nombre: p.usuario.nombre,
        email: p.usuario.email,
        preferencias: aPreferencias(p.preferenciaNotificacion),
      }));
    },

    async programar(despachoId, filas) {
      if (filas.length === 0) return 0;
      const creadas = await paraDespacho(despachoId).notificacion.createMany({
        data: filas.map((f) => ({
          despachoId,
          actuacionId: f.actuacionId,
          membresiaId: f.membresiaId,
          canal: f.canal,
          programadaPara: f.programadaPara,
        })),
        // Idempotencia: la misma actuación, persona y canal nunca se programa dos veces.
        skipDuplicates: true,
      });
      return creadas.count;
    },

    async reclamarVencidas(despachoId, { ahora, limite, arriendoMs }) {
      return paraDespacho(despachoId).$transaction(async (tx) => {
        const filas = await tx.notificacion.findMany({
          where: { estado: 'PENDIENTE', programadaPara: { lte: ahora } },
          orderBy: { programadaPara: 'asc' },
          take: limite,
          select: SELECCION_DEL_AVISO,
        });
        if (filas.length === 0) return [];
        await tx.notificacion.updateMany({
          where: { id: { in: filas.map((f) => f.id) }, estado: 'PENDIENTE' },
          data: {
            intentos: { increment: 1 },
            programadaPara: new Date(ahora.getTime() + arriendoMs),
          },
        });
        return filas.map((fila): NotificacionPorEnviar => ({
          id: fila.id,
          membresiaId: fila.membresiaId,
          canal: fila.canal,
          intentos: fila.intentos + 1,
          destinatario: {
            nombre: fila.destinatario.usuario.nombre,
            email: fila.destinatario.usuario.email,
            preferencias: aPreferencias(fila.destinatario.preferenciaNotificacion),
          },
          proceso: aProceso(fila),
          actuacion: aActuacion(fila),
        }));
      });
    },

    async marcarEnviadas(despachoId, ids, ahora) {
      if (ids.length === 0) return;
      await paraDespacho(despachoId).notificacion.updateMany({
        where: { id: { in: [...ids] } },
        data: { estado: 'ENVIADA', enviadaEn: ahora, codigoError: null },
      });
    },

    async marcarFallidas(despachoId, ids, codigoError) {
      if (ids.length === 0) return;
      await paraDespacho(despachoId).notificacion.updateMany({
        where: { id: { in: [...ids] } },
        data: { estado: 'FALLIDA', codigoError },
      });
    },

    async reprogramar(despachoId, ids, para, codigoError) {
      if (ids.length === 0) return;
      await paraDespacho(despachoId).notificacion.updateMany({
        where: { id: { in: [...ids] } },
        data: { programadaPara: para, codigoError },
      });
    },

    async deLaPersona(despachoId, membresiaId, limite) {
      const filas = await paraDespacho(despachoId).notificacion.findMany({
        where: { membresiaId },
        orderBy: { creadoEn: 'desc' },
        take: limite,
        select: SELECCION_DEL_AVISO,
      });
      return filas.map((fila): NotificacionDeLaPersona => ({
        id: fila.id,
        canal: fila.canal,
        estado: fila.estado,
        codigoError: fila.codigoError,
        programadaPara: fila.programadaPara,
        enviadaEn: fila.enviadaEn,
        proceso: aProceso(fila),
        actuacion: aActuacion(fila),
      }));
    },

    async lotesTerminadosSinAviso(despachoId, desde) {
      const filas = await paraDespacho(despachoId).consultaMasiva.findMany({
        where: { estado: 'COMPLETADA', notificadaEn: null, finalizadaEn: { gte: desde } },
        select: {
          id: true,
          totalItems: true,
          creadaPor: { select: SELECCION_DE_PERSONA },
          items: { select: { estado: true } },
        },
      });
      return filas.map((fila) => ({
        consultaId: fila.id,
        destinatario: {
          nombre: fila.creadaPor.usuario.nombre,
          email: fila.creadaPor.usuario.email,
          preferencias: aPreferencias(fila.creadaPor.preferenciaNotificacion),
        },
        procesos: fila.totalItems,
        conteo: contarItems(fila.items.map((i) => i.estado)),
      }));
    },

    async marcarLoteAvisado(despachoId, consultaId, ahora) {
      await paraDespacho(despachoId).consultaMasiva.updateMany({
        where: { id: consultaId, notificadaEn: null },
        data: { notificadaEn: ahora },
      });
    },

    async obtenerPreferencias(despachoId, membresiaId) {
      const fila = await paraDespacho(despachoId).preferenciaNotificacion.findFirst({
        where: { membresiaId },
        select: SELECCION_DE_PREFERENCIAS,
      });
      return fila ? aPreferencias(fila) : null;
    },

    async guardarPreferencias(despachoId, membresiaId, preferencias) {
      await paraDespacho(despachoId).preferenciaNotificacion.upsert({
        where: { membresiaId_despachoId: { membresiaId, despachoId } },
        create: { despachoId, membresiaId, ...preferencias },
        update: { ...preferencias },
      });
    },
  };
}
