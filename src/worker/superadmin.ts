import type { PrismaClient } from '@/generated/prisma/client';
import { esquemaContrasena, esquemaEmail, esquemaNombre } from '@/modules/usuarios/domain/esquemas';

export type ResultadoDeSuperadmin =
  | { readonly tipo: 'CREADO' }
  | { readonly tipo: 'YA_EXISTE' }
  /** No se pidió crearlo (faltan las variables) y todavía no hay ninguno. */
  | { readonly tipo: 'SIN_DATOS' }
  /** Se pidió con datos que no sirven; `problemas` dice cuáles, sin repetir su valor. */
  | { readonly tipo: 'INVALIDO'; readonly problemas: readonly string[] };

/**
 * Crea el primer operador de LURIS (superadmin) en una instalación nueva, sin la semilla de
 * desarrollo (que no corre en producción). Es idempotente y conservadora:
 * - si ya existe algún superadmin, no toca nada (cambiar la contraseña se hace desde la app);
 * - sin `email` y `contrasena`, no hace nada;
 * - nunca escribe la contraseña en ningún registro.
 */
export async function crearPrimerSuperadmin(opciones: {
  readonly prisma: PrismaClient;
  /** Hash con el mismo algoritmo que Better Auth. */
  readonly hashear: (contrasena: string) => Promise<string>;
  readonly email: string | undefined;
  readonly nombre: string | undefined;
  readonly contrasena: string | undefined;
}): Promise<ResultadoDeSuperadmin> {
  const { prisma } = opciones;
  if ((await prisma.usuario.count({ where: { esSuperadmin: true } })) > 0) {
    return { tipo: 'YA_EXISTE' };
  }
  if (!opciones.email && !opciones.contrasena) return { tipo: 'SIN_DATOS' };

  const email = esquemaEmail.safeParse(opciones.email ?? '');
  const contrasena = esquemaContrasena.safeParse(opciones.contrasena ?? '');
  const nombre = esquemaNombre.safeParse(opciones.nombre ?? 'Operador de LURIS');
  const problemas = [
    ...(email.success
      ? []
      : ['SUPERADMIN_EMAIL: ' + (email.error.issues[0]?.message ?? 'inválido')]),
    ...(contrasena.success
      ? []
      : ['SUPERADMIN_CONTRASENA: ' + (contrasena.error.issues[0]?.message ?? 'inválida')]),
    ...(nombre.success
      ? []
      : ['SUPERADMIN_NOMBRE: ' + (nombre.error.issues[0]?.message ?? 'inválido')]),
  ];
  if (!email.success || !contrasena.success || !nombre.success) {
    return { tipo: 'INVALIDO', problemas };
  }

  const hash = await opciones.hashear(contrasena.data);
  await prisma.$transaction(async (tx) => {
    // Si el correo ya era de una persona de un despacho, solo se le da el rol de operador.
    const usuario = await tx.usuario.upsert({
      where: { email: email.data },
      create: { nombre: nombre.data, email: email.data, emailVerificado: true, esSuperadmin: true },
      update: { esSuperadmin: true },
    });
    await tx.cuenta.upsert({
      where: { proveedor_idEnProveedor: { proveedor: 'credential', idEnProveedor: usuario.id } },
      create: {
        usuarioId: usuario.id,
        proveedor: 'credential',
        idEnProveedor: usuario.id,
        contrasenaHash: hash,
      },
      // No se pisa la contraseña de una cuenta que ya existía.
      update: {},
    });
  });
  return { tipo: 'CREADO' };
}
