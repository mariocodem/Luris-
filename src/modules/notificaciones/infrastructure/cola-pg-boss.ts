import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { ColaDeWhatsapp } from '../application/puertos';

/**
 * Colas de pg-boss de las notificaciones (§9). La web solo encola; el worker ejecuta: despacha
 * los avisos que vencen (cada minuto y cuando se programa uno) y mantiene la sesión de WhatsApp.
 */
export const COLAS_DE_NOTIFICACIONES = {
  despachar: 'despachar-notificaciones',
  vincularWhatsapp: 'whatsapp-vincular',
  desvincularWhatsapp: 'whatsapp-desvincular',
} as const;

/** Crea las colas si no existen (es idempotente). La llaman la web y el worker al iniciar. */
export async function asegurarColasDeNotificaciones(boss: PgBoss): Promise<void> {
  // Un despachador a la vez y a lo sumo uno en espera: despertarlo muchas veces no lo repite.
  await boss.createQueue(COLAS_DE_NOTIFICACIONES.despachar, {
    policy: 'stately',
    retryLimit: 1,
    retryDelay: 30,
    expireInSeconds: 600,
    deleteAfterSeconds: 3600,
  });
  // Vincular y desvincular no se reintentan solos: el QR vence y la persona vuelve a pedirlo.
  for (const nombre of [
    COLAS_DE_NOTIFICACIONES.vincularWhatsapp,
    COLAS_DE_NOTIFICACIONES.desvincularWhatsapp,
  ]) {
    await boss.createQueue(nombre, {
      policy: 'stately',
      retryLimit: 0,
      expireInSeconds: 300,
      deleteAfterSeconds: 3600,
    });
  }
}

/** Datos de los trabajos de WhatsApp (se validan al leerlos: vienen de la base de datos). */
export const esquemaDeTrabajoDeWhatsapp = z.object({ despachoId: z.uuid() });

export function crearColaDeWhatsapp(obtenerBoss: () => Promise<PgBoss>): ColaDeWhatsapp {
  return {
    async encolarVinculacion(despachoId) {
      const boss = await obtenerBoss();
      await boss.send(
        COLAS_DE_NOTIFICACIONES.vincularWhatsapp,
        { despachoId },
        { singletonKey: despachoId },
      );
    },
    async encolarDesvinculacion(despachoId) {
      const boss = await obtenerBoss();
      await boss.send(
        COLAS_DE_NOTIFICACIONES.desvincularWhatsapp,
        { despachoId },
        { singletonKey: despachoId },
      );
    },
  };
}

/** Despierta al despachador sin esperar al minuto siguiente (un aviso «de inmediato» sale ya). */
export function crearDespertadorDeNotificaciones(obtenerBoss: () => Promise<PgBoss>) {
  return {
    async despertar(): Promise<void> {
      const boss = await obtenerBoss();
      await boss.send(COLAS_DE_NOTIFICACIONES.despachar, null);
    },
  };
}
