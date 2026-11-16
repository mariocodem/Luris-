import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorReglaDeCuenta } from './errores';
import type { RolDeDespacho } from './rol-de-despacho';

/**
 * Reglas para administrar cuentas de un despacho. Evitan que un despacho se quede sin nadie que
 * pueda administrarlo y que una persona se bloquee a sí misma por error.
 */

export interface MiembroObjetivo {
  readonly membresiaId: string;
  readonly rol: RolDeDespacho;
  readonly activa: boolean;
}

export interface ContextoDeRegla {
  /** Membresía de quien hace el cambio. */
  readonly actorMembresiaId: string;
  /** Administradores activos del despacho, contando al objetivo si lo es. */
  readonly administradoresActivos: number;
}

const ULTIMO_ADMINISTRADOR = new ErrorReglaDeCuenta(
  'ULTIMO_ADMINISTRADOR',
  'El despacho necesita al menos un administrador activo. Asigna ese rol a otra persona antes de hacer este cambio.',
);

function esUltimoAdministrador(objetivo: MiembroObjetivo, contexto: ContextoDeRegla): boolean {
  return (
    objetivo.rol === 'administrador' && objetivo.activa && contexto.administradoresActivos <= 1
  );
}

export function validarCambioDeRol(
  objetivo: MiembroObjetivo,
  nuevoRol: RolDeDespacho,
  contexto: ContextoDeRegla,
): Result<void, ErrorReglaDeCuenta> {
  if (objetivo.rol === nuevoRol) {
    return err(new ErrorReglaDeCuenta('ROL_SIN_CAMBIOS', 'Esta persona ya tiene ese rol.'));
  }
  if (objetivo.membresiaId === contexto.actorMembresiaId) {
    return err(
      new ErrorReglaDeCuenta(
        'CAMBIO_DE_ROL_PROPIO',
        'No puedes cambiar tu propio rol. Pide a otro administrador del despacho que lo haga.',
      ),
    );
  }
  if (!objetivo.activa) {
    return err(
      new ErrorReglaDeCuenta(
        'CUENTA_DESACTIVADA',
        'Esta cuenta está desactivada. Reactívala antes de cambiarle el rol.',
      ),
    );
  }
  if (esUltimoAdministrador(objetivo, contexto)) return err(ULTIMO_ADMINISTRADOR);
  return ok(undefined);
}

export function validarDesactivacion(
  objetivo: MiembroObjetivo,
  contexto: ContextoDeRegla,
): Result<void, ErrorReglaDeCuenta> {
  if (!objetivo.activa) {
    return err(new ErrorReglaDeCuenta('YA_DESACTIVADA', 'Esta cuenta ya está desactivada.'));
  }
  if (objetivo.membresiaId === contexto.actorMembresiaId) {
    return err(
      new ErrorReglaDeCuenta(
        'DESACTIVACION_PROPIA',
        'No puedes desactivar tu propia cuenta. Pide a otro administrador del despacho que lo haga.',
      ),
    );
  }
  if (esUltimoAdministrador(objetivo, contexto)) return err(ULTIMO_ADMINISTRADOR);
  return ok(undefined);
}

export function validarReactivacion(objetivo: MiembroObjetivo): Result<void, ErrorReglaDeCuenta> {
  if (objetivo.activa) {
    return err(new ErrorReglaDeCuenta('YA_ACTIVA', 'Esta cuenta ya está activa.'));
  }
  return ok(undefined);
}
