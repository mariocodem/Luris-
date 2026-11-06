import type { Instrumentation } from 'next';

/**
 * Se ejecuta una vez al iniciar el servidor de Next.js.
 * Valida las variables de entorno para fallar al arrancar y no en la primera petición.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { obtenerDependencias } = await import('./composition-root');
  const { env, logger } = obtenerDependencias('web');
  logger.info('LURIS iniciado', { entorno: env.NODE_ENV });
}

/**
 * Registra en el log técnico los errores no controlados del servidor, con el mismo código
 * de ayuda que ve el usuario en la página de error (derivado del `digest` de Next.js).
 * No se registran cabeceras: pueden contener cookies de sesión.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ obtenerDependencias }, { codigoDeAyudaDesde }] = await Promise.all([
    import('./composition-root'),
    import('./shared/domain/codigo-de-ayuda'),
  ]);
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String(error.digest)
      : undefined;

  obtenerDependencias('web').logger.error('Error no controlado en una solicitud', {
    error,
    digest,
    codigoDeAyuda: digest ? codigoDeAyudaDesde(digest) : undefined,
    metodo: request.method,
    ruta: request.path,
    tipo: context.routeType,
    archivoDeRuta: context.routePath,
  });
};
