import { describe, expect, it } from 'vitest';
import { estaVigente, type Invitacion } from './invitacion';
import {
  validarCambioDeRol,
  validarDesactivacion,
  validarReactivacion,
  type MiembroObjetivo,
} from './reglas-de-cuenta';

const ACTOR = 'membresia-actor';

const abogado: MiembroObjetivo = { membresiaId: 'm-abogado', rol: 'abogado', activa: true };
const admin: MiembroObjetivo = { membresiaId: 'm-admin', rol: 'administrador', activa: true };

function codigo(resultado: { ok: boolean; error?: { codigo: string } }): string | undefined {
  return resultado.ok ? undefined : resultado.error?.codigo;
}

describe('validarCambioDeRol', () => {
  const contexto = { actorMembresiaId: ACTOR, administradoresActivos: 2 };

  it('permite cambiar el rol de otra persona', () => {
    expect(validarCambioDeRol(abogado, 'asistente', contexto).ok).toBe(true);
    expect(validarCambioDeRol(admin, 'abogado', contexto).ok).toBe(true);
  });

  it('rechaza el mismo rol', () => {
    expect(codigo(validarCambioDeRol(abogado, 'abogado', contexto))).toBe('ROL_SIN_CAMBIOS');
  });

  it('rechaza cambiar el propio rol', () => {
    const propio = { ...admin, membresiaId: ACTOR };
    expect(codigo(validarCambioDeRol(propio, 'abogado', contexto))).toBe('CAMBIO_DE_ROL_PROPIO');
  });

  it('rechaza quitarle el rol al último administrador activo', () => {
    const unico = { actorMembresiaId: ACTOR, administradoresActivos: 1 };
    expect(codigo(validarCambioDeRol(admin, 'abogado', unico))).toBe('ULTIMO_ADMINISTRADOR');
  });

  it('rechaza cambiar el rol de una cuenta desactivada', () => {
    const inactiva = { ...abogado, activa: false };
    expect(codigo(validarCambioDeRol(inactiva, 'asistente', contexto))).toBe('CUENTA_DESACTIVADA');
  });
});

describe('validarDesactivacion', () => {
  const contexto = { actorMembresiaId: ACTOR, administradoresActivos: 2 };

  it('permite desactivar a otra persona', () => {
    expect(validarDesactivacion(abogado, contexto).ok).toBe(true);
  });

  it('rechaza desactivarse a sí mismo', () => {
    const propio = { ...admin, membresiaId: ACTOR };
    expect(codigo(validarDesactivacion(propio, contexto))).toBe('DESACTIVACION_PROPIA');
  });

  it('rechaza desactivar al último administrador activo', () => {
    const unico = { actorMembresiaId: ACTOR, administradoresActivos: 1 };
    expect(codigo(validarDesactivacion(admin, unico))).toBe('ULTIMO_ADMINISTRADOR');
  });

  it('rechaza desactivar una cuenta ya desactivada', () => {
    expect(codigo(validarDesactivacion({ ...abogado, activa: false }, contexto))).toBe(
      'YA_DESACTIVADA',
    );
  });
});

describe('validarReactivacion', () => {
  it('solo reactiva cuentas desactivadas', () => {
    expect(validarReactivacion({ ...abogado, activa: false }).ok).toBe(true);
    expect(codigo(validarReactivacion(abogado))).toBe('YA_ACTIVA');
  });
});

describe('estaVigente', () => {
  const ahora = new Date('2026-11-14T12:00:00Z');
  const base: Invitacion = {
    id: 'i',
    despachoId: 'd',
    email: 'a@b.co',
    rol: 'abogado',
    estado: 'PENDIENTE',
    expiraEn: new Date('2026-11-15T12:00:00Z'),
    creadaEn: new Date('2026-11-12T12:00:00Z'),
  };

  it('vigente si está pendiente y no ha vencido', () => {
    expect(estaVigente(base, ahora)).toBe(true);
  });

  it('no vigente si venció, se aceptó o se canceló', () => {
    expect(estaVigente({ ...base, expiraEn: ahora }, ahora)).toBe(false);
    expect(estaVigente({ ...base, estado: 'ACEPTADA' }, ahora)).toBe(false);
    expect(estaVigente({ ...base, estado: 'CANCELADA' }, ahora)).toBe(false);
  });
});
