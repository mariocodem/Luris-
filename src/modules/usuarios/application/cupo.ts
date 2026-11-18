import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorDemasiadosIntentos } from '../domain/errores';
import type { LimitadorDeIntentos } from './puertos';

/**
 * Cupo de uso de una acción costosa o sensible (consulta masiva, guardar una credencial,
 * vincular WhatsApp): cada llamada cuenta como un intento y, pasado el máximo de la ventana,
 * se pide esperar. Frena el abuso y los intentos de adivinar credenciales de terceros.
 */
export function reservarCupo(
  limitador: LimitadorDeIntentos | undefined,
  clave: string,
): Result<void, ErrorDemasiadosIntentos> {
  if (!limitador) return ok(undefined);
  const bloqueo = limitador.minutosDeBloqueo(clave);
  if (bloqueo > 0) return err(new ErrorDemasiadosIntentos(bloqueo));
  limitador.registrarFallo(clave);
  return ok(undefined);
}
