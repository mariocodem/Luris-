import { connection } from 'next/server';
import { obtenerDependencias } from '@/composition-root';

/**
 * Comprobación de salud para el healthcheck del contenedor y el monitoreo: responde 200 si la
 * aplicación llega a la base de datos. No exige sesión y no revela nada más (ni versiones, ni
 * errores): solo «ok» o «no disponible».
 */
export async function GET(): Promise<Response> {
  await connection();
  const cabeceras = { 'Cache-Control': 'no-store' };
  try {
    await obtenerDependencias('web').baseDeDatos.sinAislamiento.$queryRaw`SELECT 1`;
    return Response.json({ estado: 'ok' }, { headers: cabeceras });
  } catch {
    return Response.json({ estado: 'no disponible' }, { status: 503, headers: cabeceras });
  }
}
