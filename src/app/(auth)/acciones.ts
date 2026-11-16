'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  esquemaContrasena,
  esquemaContrasenaActual,
  esquemaEmail,
  esquemaNombre,
} from '@/modules/usuarios/domain/esquemas';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../_servidor/peticion';

const esquemaInicio = z.object({ email: esquemaEmail, contrasena: esquemaContrasenaActual });

export async function iniciarSesionAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const conservar = { email: valores.email ?? '' };
  const datos = esquemaInicio.safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  let destino: string;
  try {
    const resultado = await casosDeUso().iniciarSesion({
      ...datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'iniciar-sesion', conservar);
    destino = resultado.value.destino;
  } catch (error) {
    return estadoDeError(error, 'iniciar-sesion', conservar);
  }
  redirect(destino);
}

export async function cerrarSesionAccion(): Promise<void> {
  try {
    await casosDeUso().cerrarSesion(await ipDeLaPeticion());
  } catch (error) {
    estadoDeError(error, 'cerrar-sesion');
  }
  redirect('/iniciar-sesion');
}

export async function solicitarRecuperacionAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const datos = z.object({ email: esquemaEmail }).safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, { email: valores.email ?? '' });

  try {
    const resultado = await casosDeUso().solicitarRecuperacion({
      email: datos.data.email,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'solicitar-recuperacion');
  } catch (error) {
    return estadoDeError(error, 'solicitar-recuperacion');
  }
  return {
    tipo: 'exito',
    mensaje:
      'Si ese correo tiene una cuenta en LURIS, te enviamos un enlace para cambiar la contraseña. Revisa tu bandeja de entrada y la carpeta de spam.',
  };
}

const esquemaNuevaContrasena = z
  .object({ token: z.string().min(1), contrasena: esquemaContrasena, confirmacion: z.string() })
  .refine((datos) => datos.contrasena === datos.confirmacion, {
    path: ['confirmacion'],
    message: 'Las contraseñas no coinciden.',
  });

export async function restablecerContrasenaAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = esquemaNuevaContrasena.safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);

  try {
    const resultado = await casosDeUso().restablecerContrasena({
      token: datos.data.token,
      contrasena: datos.data.contrasena,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'restablecer-contrasena');
  } catch (error) {
    return estadoDeError(error, 'restablecer-contrasena');
  }
  redirect('/iniciar-sesion?contrasena=actualizada');
}

const esquemaAceptacion = z.discriminatedUnion('yaTieneCuenta', [
  z.object({
    yaTieneCuenta: z.literal('si'),
    token: z.string().min(1),
    contrasena: esquemaContrasenaActual,
  }),
  z
    .object({
      yaTieneCuenta: z.literal('no'),
      token: z.string().min(1),
      nombre: esquemaNombre,
      contrasena: esquemaContrasena,
      confirmacion: z.string(),
    })
    .refine((datos) => datos.contrasena === datos.confirmacion, {
      path: ['confirmacion'],
      message: 'Las contraseñas no coinciden.',
    }),
]);

export async function aceptarInvitacionAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const conservar = { nombre: valores.nombre ?? '' };
  const datos = esquemaAceptacion.safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  try {
    const resultado = await casosDeUso().aceptarInvitacion({
      token: datos.data.token,
      nombre: datos.data.yaTieneCuenta === 'no' ? datos.data.nombre : null,
      contrasena: datos.data.contrasena,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'aceptar-invitacion', conservar);
  } catch (error) {
    return estadoDeError(error, 'aceptar-invitacion', conservar);
  }
  redirect('/inicio');
}
