import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearPrimerSuperadmin } from '@/worker/superadmin';
import { crearClienteDePruebas } from './apoyo';

/** Primer superadministrador de una instalación nueva (Docker, Fase 13) sobre PostgreSQL real. */

let prisma: PrismaClient;
const hashear = async (contrasena: string) => `hash(${contrasena})`;
const CORREO = 'operador-nuevo@luris-pruebas.test';

beforeAll(() => {
  prisma = crearClienteDePruebas();
});

beforeEach(async () => {
  // Cada caso parte de una base sin superadministradores.
  await prisma.cuenta.deleteMany({ where: { usuario: { esSuperadmin: true } } });
  await prisma.usuario.updateMany({ where: { esSuperadmin: true }, data: { esSuperadmin: false } });
  await prisma.cuenta.deleteMany({ where: { usuario: { email: CORREO } } });
  await prisma.usuario.deleteMany({ where: { email: CORREO } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const datos = { email: CORREO, nombre: 'Operadora Nueva', contrasena: 'una-clave-larga-2026' };

describe('crearPrimerSuperadmin', () => {
  it('crea al operador con su cuenta y la contraseña con hash, nunca en claro', async () => {
    const r = await crearPrimerSuperadmin({ prisma, hashear, ...datos });
    expect(r).toEqual({ tipo: 'CREADO' });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: CORREO } });
    expect(usuario).toMatchObject({
      esSuperadmin: true,
      emailVerificado: true,
      nombre: 'Operadora Nueva',
    });
    const cuenta = await prisma.cuenta.findFirstOrThrow({ where: { usuarioId: usuario.id } });
    expect(cuenta.proveedor).toBe('credential');
    expect(cuenta.contrasenaHash).toBe('hash(una-clave-larga-2026)');
  });

  it('es idempotente: con un superadmin existente no cambia nada', async () => {
    await crearPrimerSuperadmin({ prisma, hashear, ...datos });
    const otra = await crearPrimerSuperadmin({
      prisma,
      hashear: async () => 'otro-hash',
      email: 'otro@luris-pruebas.test',
      nombre: 'Otro',
      contrasena: 'otra-clave-larga-2026',
    });
    expect(otra).toEqual({ tipo: 'YA_EXISTE' });
    expect(await prisma.usuario.count({ where: { email: 'otro@luris-pruebas.test' } })).toBe(0);
    const cuenta = await prisma.cuenta.findFirstOrThrow({ where: { usuario: { email: CORREO } } });
    expect(cuenta.contrasenaHash).toBe('hash(una-clave-larga-2026)');
  });

  it('sin variables no hace nada (y avisa de que no hay superadmin)', async () => {
    const r = await crearPrimerSuperadmin({
      prisma,
      hashear,
      email: undefined,
      nombre: undefined,
      contrasena: undefined,
    });
    expect(r).toEqual({ tipo: 'SIN_DATOS' });
  });

  it('rechaza datos inválidos explicando cuáles, sin repetir la contraseña', async () => {
    const r = await crearPrimerSuperadmin({
      prisma,
      hashear,
      email: 'no-es-un-correo',
      nombre: 'Operadora',
      contrasena: 'corta',
    });
    expect(r.tipo).toBe('INVALIDO');
    if (r.tipo !== 'INVALIDO') return;
    expect(r.problemas.join(' ')).toContain('SUPERADMIN_EMAIL');
    expect(r.problemas.join(' ')).toContain('SUPERADMIN_CONTRASENA');
    expect(r.problemas.join(' ')).not.toContain('corta');
    expect(await prisma.usuario.count({ where: { esSuperadmin: true } })).toBe(0);
  });

  it('si el correo ya era de una persona de un despacho, solo recibe el rol y conserva su contraseña', async () => {
    const existente = await prisma.usuario.create({
      data: { nombre: 'Ya Existía', email: CORREO },
    });
    await prisma.cuenta.create({
      data: {
        usuarioId: existente.id,
        proveedor: 'credential',
        idEnProveedor: existente.id,
        contrasenaHash: 'hash-anterior',
      },
    });
    const r = await crearPrimerSuperadmin({ prisma, hashear, ...datos });
    expect(r).toEqual({ tipo: 'CREADO' });
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { email: CORREO } })).esSuperadmin,
    ).toBe(true);
    const cuenta = await prisma.cuenta.findFirstOrThrow({ where: { usuarioId: existente.id } });
    expect(cuenta.contrasenaHash).toBe('hash-anterior');
  });
});
