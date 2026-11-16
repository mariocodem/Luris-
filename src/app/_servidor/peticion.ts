import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { obtenerCasosDeUso, obtenerDependencias, type CasosDeUso } from '@/composition-root';
import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import { aAppError, type AppError } from '@/shared/domain/app-error';

/**
 * Puente entre Next.js y los casos de uso: les pasa las cabeceras de la petición en curso.
 * Solo se usa en Server Components y server actions.
 */
export function casosDeUso(): CasosDeUso {
  return obtenerCasosDeUso(async () => new Headers(await headers()));
}

/** IP del cliente según el proxy de entrada (para el limitador y la auditoría). */
export async function ipDeLaPeticion(): Promise<string | null> {
  const cabeceras = await headers();
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = reenviada || cabeceras.get('x-real-ip')?.trim();
  return ip ? ip.slice(0, 45) : null;
}

/**
 * Sesión obligatoria para páginas: sin sesión, al inicio de sesión; sin acceso, a la página
 * que explica por qué. Siempre llamarla dentro de un <Suspense> (Cache Components).
 */
export async function exigirSesion(): Promise<ContextoDeSesion> {
  // La sesión depende de la petición: nunca se prerenderiza.
  await connection();
  const contexto = await casosDeUso().obtenerContextoDeSesion();
  if (contexto.ok) return contexto.value;
  if (contexto.error.codigo === 'NO_AUTENTICADO') redirect('/iniciar-sesion');
  redirect(
    `/sin-acceso?motivo=${contexto.error.codigo === 'DESPACHO_SUSPENDIDO' ? 'suspendido' : 'cuenta'}`,
  );
}

/** Deja el detalle técnico en el log (con el código de ayuda) y devuelve el error seguro. */
export function registrarSiEsInesperado(valor: unknown, operacion: string): AppError {
  const error = aAppError(valor);
  if (error.codigo === 'INESPERADO' || error.codigo === 'CORREO_NO_ENVIADO') {
    obtenerDependencias('web').logger.error('Fallo en una acción', {
      operacion,
      codigoDeAyuda: error.codigoDeAyuda,
      error: error.cause ?? error,
    });
  }
  return error;
}
