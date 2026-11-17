import { describe, expect, it } from 'vitest';
import type { Perfil } from '@/modules/usuarios/domain/permisos';
import type { Asignacion } from './proceso';
import {
  asignacionDelCreador,
  permisosSobreProceso,
  validarAsignado,
  validarResponsable,
  type MiembroAsignable,
} from './reglas';

const YO = 'm-yo';
const OTRO = 'm-otro';

const SIN_ASIGNACIONES: Asignacion[] = [];
const SOY_RESPONSABLE: Asignacion[] = [{ membresiaId: YO, tipo: 'RESPONSABLE' }];
const SOY_APOYO: Asignacion[] = [
  { membresiaId: OTRO, tipo: 'RESPONSABLE' },
  { membresiaId: YO, tipo: 'ASIGNADO' },
];
const DE_OTRO: Asignacion[] = [{ membresiaId: OTRO, tipo: 'RESPONSABLE' }];

type Caso = [Perfil, string, Asignacion[], [boolean, boolean, boolean, boolean]];

/** [perfil, situación, asignaciones, [ver, editar, cambiarResponsable, gestionarAsignados]] */
const CASOS: Caso[] = [
  ['administrador', 'sin asignaciones', SIN_ASIGNACIONES, [true, true, true, true]],
  ['administrador', 'de otro', DE_OTRO, [true, true, true, true]],
  ['abogado', 'responsable', SOY_RESPONSABLE, [true, true, false, true]],
  ['abogado', 'como apoyo', SOY_APOYO, [true, true, false, false]],
  ['abogado', 'de otro', DE_OTRO, [false, false, false, false]],
  ['abogado', 'sin asignaciones', SIN_ASIGNACIONES, [false, false, false, false]],
  ['asistente', 'asignado', SOY_APOYO, [true, true, false, false]],
  ['asistente', 'de otro', DE_OTRO, [false, false, false, false]],
  ['superadmin', 'cualquiera', SOY_RESPONSABLE, [false, false, false, false]],
];

describe('permisosSobreProceso', () => {
  it.each(CASOS)('%s · %s', (perfil, _situacion, asignaciones, esperado) => {
    const { ver, editar, cambiarResponsable, gestionarAsignados } = permisosSobreProceso(
      perfil,
      asignaciones,
      YO,
    );
    expect([ver, editar, cambiarResponsable, gestionarAsignados]).toEqual(esperado);
  });
});

describe('asignacionDelCreador', () => {
  it('el abogado queda responsable, el asistente asignado y el administrador sin asignación', () => {
    expect(asignacionDelCreador('abogado', YO)).toEqual({ membresiaId: YO, tipo: 'RESPONSABLE' });
    expect(asignacionDelCreador('asistente', YO)).toEqual({ membresiaId: YO, tipo: 'ASIGNADO' });
    expect(asignacionDelCreador('administrador', YO)).toBeNull();
    expect(asignacionDelCreador('superadmin', YO)).toBeNull();
  });
});

describe('validaciones de asignación', () => {
  const miembro = (rol: MiembroAsignable['rol'], activa = true): MiembroAsignable => ({
    membresiaId: OTRO,
    nombre: 'Laura',
    rol,
    activa,
  });

  it('el responsable debe ser abogado o administrador activo', () => {
    expect(validarResponsable(miembro('abogado')).ok).toBe(true);
    expect(validarResponsable(miembro('administrador')).ok).toBe(true);
    const asistente = validarResponsable(miembro('asistente'));
    expect(!asistente.ok && asistente.error.mensajeUsuario).toMatch(/asígnalo como apoyo/);
    const inactivo = validarResponsable(miembro('abogado', false));
    expect(!inactivo.ok && inactivo.error.mensajeUsuario).toMatch(/Laura está desactivada/);
    expect(validarResponsable(null).ok).toBe(false);
  });

  it('cualquier persona activa puede apoyar, sin importar su rol', () => {
    expect(validarAsignado(miembro('asistente')).ok).toBe(true);
    expect(validarAsignado(miembro('abogado')).ok).toBe(true);
    expect(validarAsignado(miembro('asistente', false)).ok).toBe(false);
    expect(validarAsignado(null).ok).toBe(false);
  });
});
