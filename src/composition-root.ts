/**
 * Raíz de composición: el único lugar donde se conectan implementaciones concretas
 * (adaptadores) con los puertos que usan los casos de uso. Inyección manual, sin contenedor DI.
 *
 * Las capas de dominio y aplicación nunca importan este archivo; lo usan las fronteras
 * (páginas, server actions, route handlers, worker).
 */
import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/shared/domain/logger';
import { obtenerEnv, type Env } from '@/shared/infrastructure/env';
import { crearLoggerPino } from '@/shared/infrastructure/logger';
import {
  crearClienteDeDespacho,
  type ClienteDeDespacho,
} from '@/shared/infrastructure/prisma/aislamiento-despacho';
import { obtenerClientePrismaCompartido } from '@/shared/infrastructure/prisma/cliente';

export interface BaseDeDatos {
  /** Acceso a datos de negocio, siempre limitado al despacho de la sesión. */
  paraDespacho(despachoId: string): ClienteDeDespacho;
  /**
   * Acceso SIN filtro de despacho. Solo para autenticación, administración de despachos
   * (superadmin) y tareas de plataforma. Nunca para leer datos de procesos.
   */
  readonly sinAislamiento: PrismaClient;
}

export interface Dependencias {
  readonly env: Env;
  readonly logger: Logger;
  readonly baseDeDatos: BaseDeDatos;
}

type Servicio = 'web' | 'worker' | 'cli';

const dependenciasPorServicio = new Map<Servicio, Dependencias>();

export function obtenerDependencias(servicio: Servicio = 'web'): Dependencias {
  const existentes = dependenciasPorServicio.get(servicio);
  if (existentes) return existentes;

  const dependencias = construir(servicio);
  dependenciasPorServicio.set(servicio, dependencias);
  return dependencias;
}

function construir(servicio: Servicio): Dependencias {
  const env = obtenerEnv();
  const logger = crearLoggerPino({ nivel: env.LOG_LEVEL, formato: env.LOG_FORMAT, servicio });
  // El cliente no abre conexiones hasta la primera consulta.
  const prisma = obtenerClientePrismaCompartido(env.DATABASE_URL);

  return {
    env,
    logger,
    baseDeDatos: {
      paraDespacho: (despachoId) => crearClienteDeDespacho(prisma, despachoId),
      sinAislamiento: prisma,
    },
  };
}
