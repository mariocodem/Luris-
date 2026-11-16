'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { esquemaEmail, esquemaId } from '@/modules/usuarios/domain/esquemas';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../../../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../../../_servidor/peticion';

const esquemaNuevoDespacho = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, 'Escribe el nombre del despacho (al menos 3 letras).')
    .max(200, 'El nombre puede tener máximo 200 caracteres.'),
  nit: z
    .string()
    .transform((texto) => texto.replace(/\D/g, ''))
    .refine((digitos) => digitos.length === 0 || (digitos.length >= 9 && digitos.length <= 15), {
      message: 'El NIT debe tener entre 9 y 15 números (incluye el dígito de verificación).',
    })
    .transform((digitos) => (digitos.length > 0 ? digitos : null)),
  emailAdministrador: esquemaEmail,
});

export async function crearDespachoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const conservar = {
    nombre: valores.nombre ?? '',
    nit: valores.nit ?? '',
    emailAdministrador: valores.emailAdministrador ?? '',
  };
  const datos = esquemaNuevoDespacho.safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  let correoEnviado: boolean;
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'crear-despacho');
    const resultado = await casos.crearDespacho(sesion.value, {
      ...datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'crear-despacho', conservar);
    correoEnviado = resultado.value.correoEnviado;
  } catch (error) {
    return estadoDeError(error, 'crear-despacho', conservar);
  }
  refresh();
  return {
    tipo: 'exito',
    mensaje: correoEnviado
      ? `Creamos ${datos.data.nombre} y enviamos la invitación a ${datos.data.emailAdministrador}.`
      : `Creamos ${datos.data.nombre}, pero no pudimos enviar la invitación. Inténtalo de nuevo más tarde.`,
  };
}

export async function cambiarEstadoDeDespachoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z
    .object({ despachoId: esquemaId, estado: z.enum(['ACTIVO', 'SUSPENDIDO']) })
    .safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);

  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'estado-de-despacho');
    const resultado = await casos.cambiarEstadoDeDespacho(sesion.value, {
      ...datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'estado-de-despacho');
  } catch (error) {
    return estadoDeError(error, 'estado-de-despacho');
  }
  refresh();
  return {
    tipo: 'exito',
    mensaje: datos.data.estado === 'SUSPENDIDO' ? 'Despacho suspendido.' : 'Despacho reactivado.',
  };
}
