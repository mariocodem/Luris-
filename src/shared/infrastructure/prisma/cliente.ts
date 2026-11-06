import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Crea un cliente de Prisma SIN aislamiento por despacho.
 *
 * Solo deben usarlo la autenticación, la administración de despachos (superadmin), las
 * semillas y las pruebas. El acceso a datos de negocio pasa siempre por
 * `crearClienteDeDespacho` (ver aislamiento-despacho.ts).
 */
export function crearClientePrisma(urlConexion: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: urlConexion,
    // El driver `pg` no tiene tiempo de espera por defecto; Prisma 6 usaba 5 s.
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

const globalParaPrisma = globalThis as typeof globalThis & { __lurisPrisma?: PrismaClient };

/**
 * Cliente compartido por proceso. Se guarda en `globalThis` para que la recarga en caliente
 * de Next.js no abra un pool de conexiones nuevo en cada cambio.
 */
export function obtenerClientePrismaCompartido(urlConexion: string): PrismaClient {
  globalParaPrisma.__lurisPrisma ??= crearClientePrisma(urlConexion);
  return globalParaPrisma.__lurisPrisma;
}
