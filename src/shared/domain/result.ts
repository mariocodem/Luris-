/**
 * Resultado de una operación que puede fallar de forma esperable.
 *
 * Los errores esperables (validación, "no encontrado", plataforma caída…) se devuelven
 * como `Err`, nunca se lanzan. Las excepciones quedan para fallos realmente inesperados.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Transforma el valor si el resultado es exitoso. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Transforma el error si el resultado falló. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Encadena una operación que también puede fallar. */
export function andThen<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}

/** Devuelve el valor o un valor por defecto si el resultado falló. */
export function unwrapOr<T, E>(result: Result<T, E>, valorPorDefecto: T): T {
  return result.ok ? result.value : valorPorDefecto;
}

/**
 * Convierte una promesa que puede rechazarse en un `Result`.
 * Útil en adaptadores para traducir excepciones de librerías a errores del dominio.
 */
export async function fromPromise<T, E>(
  promesa: Promise<T>,
  mapearError: (causa: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await promesa);
  } catch (causa) {
    return err(mapearError(causa));
  }
}

/**
 * Reúne varios resultados: éxito con todos los valores, o la lista de todos los errores.
 * A diferencia de un "falla al primero", sirve para validar lotes (p. ej. consulta masiva).
 */
export function combinar<T, E>(resultados: readonly Result<T, E>[]): Result<T[], E[]> {
  const valores: T[] = [];
  const errores: E[] = [];
  for (const resultado of resultados) {
    if (resultado.ok) valores.push(resultado.value);
    else errores.push(resultado.error);
  }
  return errores.length > 0 ? err(errores) : ok(valores);
}
