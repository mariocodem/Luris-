import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/shared/domain/logger';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { EventoDeAuditoria, RegistradorDeAuditoria } from '../domain/registro-de-auditoria';

/**
 * Guarda la auditoría en `registros_auditoria`. Los eventos con despacho pasan por el cliente
 * aislado de ese despacho; los de plataforma (sin despacho) por el cliente sin aislamiento.
 */
export function crearRegistradorPrisma(opciones: {
  readonly paraDespacho: (despachoId: string) => ClienteDeDespacho;
  readonly sinAislamiento: PrismaClient;
  readonly logger: Logger;
}): RegistradorDeAuditoria {
  return {
    async registrar(evento: EventoDeAuditoria) {
      const data = {
        actorId: evento.actorId,
        accion: evento.accion,
        entidad: evento.entidad ?? null,
        entidadId: evento.entidadId ?? null,
        datos: evento.datos ?? undefined,
        ip: evento.ip ?? null,
      };
      try {
        if (evento.despachoId) {
          await opciones
            .paraDespacho(evento.despachoId)
            .registroAuditoria.create({ data: { ...data, despachoId: evento.despachoId } });
        } else {
          await opciones.sinAislamiento.registroAuditoria.create({ data });
        }
      } catch (error) {
        opciones.logger.error('No se pudo registrar un evento de auditoría', {
          error,
          accion: evento.accion,
        });
      }
    },
  };
}
