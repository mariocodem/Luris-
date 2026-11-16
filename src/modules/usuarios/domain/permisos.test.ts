import { describe, expect, it } from 'vitest';
import { ErrorSinPermiso } from '@/shared/domain/app-error';
import {
  ACCIONES,
  alcanceDe,
  autorizar,
  PERFILES,
  puede,
  type Accion,
  type Alcance,
  type Perfil,
  type RelacionConRecurso,
} from './permisos';

/**
 * Transcripción literal de la tabla del §5 de CLAUDE.md, independiente de la implementación:
 * si alguien cambia la matriz por error, estas pruebas lo detectan celda por celda.
 *
 *   ✅ = TODOS · — = NINGUNO · "propios" = PROPIOS · "asignados" = ASIGNADOS
 */
const TABLA_DEL_PARRAFO_5: Readonly<Record<Accion, readonly [Alcance, Alcance, Alcance, Alcance]>> =
  {
    //                           superadmin  administrador  abogado     asistente
    DESPACHOS_GESTIONAR: /*    */ ['TODOS', 'NINGUNO', 'NINGUNO', 'NINGUNO'],
    CUENTAS_GESTIONAR: /*      */ ['NINGUNO', 'TODOS', 'NINGUNO', 'NINGUNO'],
    ROLES_ASIGNAR: /*          */ ['NINGUNO', 'TODOS', 'NINGUNO', 'NINGUNO'],
    CREDENCIALES_GESTIONAR: /* */ ['NINGUNO', 'TODOS', 'PROPIOS', 'NINGUNO'],
    PROCESOS_REGISTRAR_EDITAR: ['NINGUNO', 'TODOS', 'PROPIOS', 'ASIGNADOS'],
    PROCESOS_CONSULTAR: /*     */ ['NINGUNO', 'TODOS', 'PROPIOS', 'ASIGNADOS'],
    CONSULTA_MASIVA: /*        */ ['NINGUNO', 'TODOS', 'TODOS', 'TODOS'],
    NOTIFICACIONES_CONFIGURAR: ['NINGUNO', 'PROPIOS', 'PROPIOS', 'PROPIOS'],
    AUDITORIA_VER: /*          */ ['TODOS', 'TODOS', 'NINGUNO', 'NINGUNO'],
  };

const COMBINACIONES_DE_RECURSO: readonly RelacionConRecurso[] = [
  { esPropio: true, estaAsignado: true },
  { esPropio: true, estaAsignado: false },
  { esPropio: false, estaAsignado: true },
  { esPropio: false, estaAsignado: false },
];

/** Lo que el §5 dice que debe pasar para un alcance y un recurso concreto. */
function esperado(alcance: Alcance, recurso: RelacionConRecurso): boolean {
  switch (alcance) {
    case 'NINGUNO':
      return false;
    case 'TODOS':
      return true;
    case 'PROPIOS':
      return recurso.esPropio;
    case 'ASIGNADOS':
      return recurso.estaAsignado;
  }
}

const CELDAS = ACCIONES.flatMap((accion) =>
  PERFILES.map((perfil, columna) => ({
    accion,
    perfil,
    alcance: TABLA_DEL_PARRAFO_5[accion][columna] as Alcance,
  })),
);

describe('matriz de permisos (§5)', () => {
  it('cubre todas las filas y columnas del §5', () => {
    expect(CELDAS).toHaveLength(ACCIONES.length * PERFILES.length);
    expect(Object.keys(TABLA_DEL_PARRAFO_5).sort()).toEqual([...ACCIONES].sort());
  });

  describe.each(CELDAS)('$perfil · $accion → $alcance', ({ accion, perfil, alcance }) => {
    it('tiene el alcance del §5', () => {
      expect(alcanceDe(perfil, accion)).toBe(alcance);
    });

    it('sin recurso concreto: permite si tiene algún alcance', () => {
      expect(puede(perfil, accion)).toBe(alcance !== 'NINGUNO');
    });

    it.each(COMBINACIONES_DE_RECURSO)(
      'sobre un recurso (propio: $esPropio, asignado: $estaAsignado)',
      (recurso) => {
        expect(puede(perfil, accion, recurso)).toBe(esperado(alcance, recurso));
      },
    );
  });
});

describe('reglas clave del §5', () => {
  const procesoAjeno: RelacionConRecurso = { esPropio: false, estaAsignado: false };

  it('el superadmin no ve datos de procesos de los despachos', () => {
    expect(puede('superadmin', 'PROCESOS_CONSULTAR')).toBe(false);
    expect(puede('superadmin', 'PROCESOS_REGISTRAR_EDITAR')).toBe(false);
    expect(puede('superadmin', 'CONSULTA_MASIVA')).toBe(false);
  });

  it('el abogado no ve procesos ajenos y el asistente solo los asignados', () => {
    expect(puede('abogado', 'PROCESOS_CONSULTAR', procesoAjeno)).toBe(false);
    expect(puede('asistente', 'PROCESOS_CONSULTAR', procesoAjeno)).toBe(false);
    expect(puede('asistente', 'PROCESOS_CONSULTAR', { esPropio: true, estaAsignado: false })).toBe(
      false,
    );
    expect(puede('administrador', 'PROCESOS_CONSULTAR', procesoAjeno)).toBe(true);
  });

  it('solo el administrador gestiona cuentas y asigna roles', () => {
    const quienes = (accion: Accion): Perfil[] => PERFILES.filter((p) => puede(p, accion));
    expect(quienes('CUENTAS_GESTIONAR')).toEqual(['administrador']);
    expect(quienes('ROLES_ASIGNAR')).toEqual(['administrador']);
    expect(quienes('DESPACHOS_GESTIONAR')).toEqual(['superadmin']);
  });
});

describe('autorizar', () => {
  it('devuelve ok cuando está permitido', () => {
    expect(autorizar('administrador', 'CUENTAS_GESTIONAR')).toEqual({ ok: true, value: undefined });
  });

  it('devuelve un ErrorSinPermiso con mensaje para el usuario cuando no lo está', () => {
    const resultado = autorizar('asistente', 'CUENTAS_GESTIONAR');
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toBeInstanceOf(ErrorSinPermiso);
    expect(resultado.error.mensajeUsuario).toMatch(/No tienes permiso/);
    expect(resultado.error.mensajeUsuario).not.toMatch(/asistente|CUENTAS_GESTIONAR/);
  });
});
