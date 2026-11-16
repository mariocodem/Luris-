import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearObtenerContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import { crearBetterAuth } from '@/modules/usuarios/infrastructure/autenticacion/better-auth';
import { crearServicioBetterAuth } from '@/modules/usuarios/infrastructure/autenticacion/servicio-better-auth';
import {
  crearRepositorioDeInvitaciones,
  crearRepositorioDeMembresias,
  crearRepositorioDeUsuarios,
} from '@/modules/usuarios/infrastructure/repositorios-prisma';
import { generadorDeTokens } from '@/modules/usuarios/infrastructure/utilidades';
import type { Logger } from '@/shared/domain/logger';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import { crearClienteDePruebas, sufijoUnico } from './apoyo';

/**
 * Better Auth de punta a punta contra PostgreSQL: confirma que el mapeo a las tablas en español
 * funciona y que las reglas de sesión, recuperación e invitación se cumplen en la base real.
 */

const loggerSilencioso: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => loggerSilencioso,
};

const CONTRASENA = 'Contrasena-de-prueba-1';

let prisma: PrismaClient;
let despachoId: string;
const enviarRecuperacion = vi.fn<(datos: { email: string; token: string }) => Promise<void>>(
  async () => undefined,
);

function montar(cabeceras: Headers = new Headers()) {
  const datos = {
    paraDespacho: (id: string) => crearClienteDeDespacho(prisma, id),
    sinAislamiento: prisma,
  };
  const membresias = crearRepositorioDeMembresias(datos);
  const auth = crearBetterAuth({
    prisma,
    secreto: 'secreto-de-pruebas-de-integracion-con-32-caracteres',
    urlBase: 'http://localhost:3000',
    minutosRecuperacion: 60,
    logger: loggerSilencioso,
    enviarRecuperacion,
    despachoInicial: async (usuarioId) =>
      (await membresias.primerDespachoDisponible(usuarioId)).despachoId,
  });
  const autenticacion = crearServicioBetterAuth({
    auth,
    prisma,
    cabeceras: async () => cabeceras,
    logger: loggerSilencioso,
  });
  return {
    auth,
    autenticacion,
    membresias,
    usuarios: crearRepositorioDeUsuarios(datos),
    invitaciones: crearRepositorioDeInvitaciones(datos),
  };
}

/** Inicia sesión y devuelve las cabeceras con la cookie, como las mandaría el navegador. */
async function cookieDeSesion(email: string, contrasena: string): Promise<Headers> {
  const { auth } = montar();
  const { headers } = await auth.api.signInEmail({
    body: { email, password: contrasena },
    returnHeaders: true,
  });
  const cookies = headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  return new Headers({ cookie: cookies });
}

async function crearPersona(nombre: string) {
  const email = `${nombre}-${sufijoUnico()}@pruebas.test`;
  const { usuarioId } = await montar().autenticacion.crearUsuarioConContrasena({
    nombre,
    email,
    contrasena: CONTRASENA,
  });
  return { usuarioId, email };
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  const despacho = await prisma.despacho.create({
    data: { nombre: 'Despacho de autenticación', slug: `auth-${sufijoUnico()}` },
  });
  despachoId = despacho.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cuentas y sesiones con Better Auth', () => {
  it('crea el usuario con la contraseña cifrada en las tablas de LURIS', async () => {
    const { usuarioId } = await crearPersona('nueva');
    const cuenta = await prisma.cuenta.findFirstOrThrow({ where: { usuarioId } });
    expect(cuenta.proveedor).toBe('credential');
    expect(cuenta.contrasenaHash).toBeTruthy();
    expect(cuenta.contrasenaHash).not.toContain(CONTRASENA);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    expect(usuario.emailVerificado).toBe(true);
    expect(usuario.esSuperadmin).toBe(false);
  });

  it('inicia sesión con la contraseña correcta y rechaza la incorrecta', async () => {
    const { email, usuarioId } = await crearPersona('login');
    const { autenticacion } = montar();

    const correcta = await autenticacion.iniciarSesion(email, CONTRASENA);
    expect(correcta.ok && correcta.value.usuarioId).toBe(usuarioId);

    const incorrecta = await autenticacion.iniciarSesion(email, 'otra-contrasena-123');
    expect(incorrecta).toEqual({ ok: false, error: 'CREDENCIALES_INVALIDAS' });

    const inexistente = await autenticacion.iniciarSesion('nadie@pruebas.test', CONTRASENA);
    expect(inexistente).toEqual({ ok: false, error: 'CREDENCIALES_INVALIDAS' });
  });

  it('no permite registrarse por cuenta propia (solo por invitación)', async () => {
    const { auth } = montar();
    await expect(
      auth.api.signUpEmail({
        body: {
          name: 'Intrusa',
          email: `intrusa-${sufijoUnico()}@pruebas.test`,
          password: CONTRASENA,
        },
      }),
    ).rejects.toThrow();
  });

  it('la sesión arranca en el despacho de la persona y se resuelve desde la cookie', async () => {
    const { email, usuarioId } = await crearPersona('miembro');
    await prisma.membresia.create({ data: { despachoId, usuarioId, rol: 'abogado' } });

    const cabeceras = await cookieDeSesion(email, CONTRASENA);
    const { autenticacion, usuarios, membresias } = montar(cabeceras);
    const sesion = await autenticacion.sesionActual();
    expect(sesion).toMatchObject({ usuarioId, despachoActivoId: despachoId });

    const contexto = await crearObtenerContextoDeSesion({ autenticacion, usuarios, membresias })();
    expect(contexto.ok && contexto.value).toMatchObject({
      perfil: 'abogado',
      despacho: { id: despachoId },
    });
  });

  it('una cuenta desactivada pierde el acceso de inmediato, aunque tenga sesión', async () => {
    const { email, usuarioId } = await crearPersona('desactivada');
    const membresia = await prisma.membresia.create({
      data: { despachoId, usuarioId, rol: 'asistente' },
    });
    const cabeceras = await cookieDeSesion(email, CONTRASENA);
    await prisma.membresia.update({ where: { id: membresia.id }, data: { activa: false } });

    const deps = montar(cabeceras);
    const contexto = await crearObtenerContextoDeSesion(deps)();
    expect(contexto.ok).toBe(false);
    if (contexto.ok) return;
    expect(contexto.error.codigo).toBe('CUENTA_SIN_ACCESO');
  });

  it('cerrar o revocar la sesión la invalida', async () => {
    const { email } = await crearPersona('revocada');
    const { autenticacion } = montar();
    const inicio = await autenticacion.iniciarSesion(email, CONTRASENA);
    if (!inicio.ok) throw new Error('debía iniciar sesión');
    await autenticacion.revocarSesion(inicio.value.tokenDeSesion);
    expect(await prisma.sesion.count({ where: { token: inicio.value.tokenDeSesion } })).toBe(0);
  });
});

describe('recuperación de contraseña', () => {
  it('el enlace cambia la contraseña una sola vez y cierra las sesiones abiertas', async () => {
    const { email, usuarioId } = await crearPersona('recupera');
    const { autenticacion } = montar();
    await autenticacion.iniciarSesion(email, CONTRASENA);
    enviarRecuperacion.mockClear();

    await autenticacion.solicitarRecuperacion(email);
    await vi.waitFor(() => expect(enviarRecuperacion).toHaveBeenCalledTimes(1));
    const token = enviarRecuperacion.mock.calls[0]?.[0].token ?? '';

    const nueva = 'Contrasena-nueva-2026';
    expect(await autenticacion.restablecerContrasena(token, nueva)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await prisma.sesion.count({ where: { usuarioId } })).toBe(0);
    expect((await autenticacion.iniciarSesion(email, CONTRASENA)).ok).toBe(false);
    expect((await autenticacion.iniciarSesion(email, nueva)).ok).toBe(true);
    expect(await autenticacion.restablecerContrasena(token, 'Otra-contrasena-3')).toEqual({
      ok: false,
      error: 'TOKEN_INVALIDO',
    });
  });

  it('no revela si el correo existe', async () => {
    enviarRecuperacion.mockClear();
    await montar().autenticacion.solicitarRecuperacion(`nadie-${sufijoUnico()}@pruebas.test`);
    expect(enviarRecuperacion).not.toHaveBeenCalled();
  });
});

describe('invitaciones', () => {
  async function invitar(email: string) {
    const { usuarioId: invitadoPorId } = await crearPersona('admin');
    const token = generadorDeTokens.generar();
    const invitacion = await montar().invitaciones.crear({
      despachoId,
      email,
      rol: 'abogado',
      expiraEn: new Date(Date.now() + 3_600_000),
      invitadoPorId,
      tokenHash: generadorDeTokens.hash(token),
    });
    return { invitacion, token };
  }

  it('se encuentra por el hash del token, nunca por el token en claro', async () => {
    const { invitacion, token } = await invitar(`buscada-${sufijoUnico()}@pruebas.test`);
    const { invitaciones } = montar();
    expect((await invitaciones.buscarPorTokenHash(generadorDeTokens.hash(token)))?.id).toBe(
      invitacion.id,
    );
    expect(await invitaciones.buscarPorTokenHash(token)).toBeNull();
  });

  it('reenviar reemplaza la invitación pendiente anterior', async () => {
    const email = `reenvio-${sufijoUnico()}@pruebas.test`;
    const primera = await invitar(email);
    const segunda = await invitar(email);
    const pendientes = await prisma.invitacion.findMany({ where: { email, estado: 'pending' } });
    expect(pendientes.map((i) => i.id)).toEqual([segunda.invitacion.id]);
    expect(
      (await prisma.invitacion.findUniqueOrThrow({ where: { id: primera.invitacion.id } })).estado,
    ).toBe('canceled');
  });

  it('es de un solo uso aunque se acepte dos veces a la vez', async () => {
    const email = `unica-${sufijoUnico()}@pruebas.test`;
    const { invitacion } = await invitar(email);
    const { usuarioId } = await crearPersona('invitada');
    const { invitaciones } = montar();

    const resultados = await Promise.all([
      invitaciones.aceptar({ invitacionId: invitacion.id, usuarioId, ahora: new Date() }),
      invitaciones.aceptar({ invitacionId: invitacion.id, usuarioId, ahora: new Date() }),
    ]);
    expect(resultados.filter((r) => r.aceptada)).toHaveLength(1);
    expect(await prisma.membresia.count({ where: { despachoId, usuarioId } })).toBe(1);
    expect(await prisma.preferenciaNotificacion.count({ where: { despachoId } })).toBeGreaterThan(
      0,
    );
  });

  it('no se puede aceptar vencida', async () => {
    const { invitacion } = await invitar(`vencida-${sufijoUnico()}@pruebas.test`);
    const { usuarioId } = await crearPersona('tarde');
    const resultado = await montar().invitaciones.aceptar({
      invitacionId: invitacion.id,
      usuarioId,
      ahora: new Date(Date.now() + 2 * 3_600_000),
    });
    expect(resultado.aceptada).toBe(false);
  });
});
