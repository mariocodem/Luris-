'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import {
  ALCANCES_DE_CREDENCIAL,
  PLATAFORMAS_CON_CREDENCIALES,
} from '@/modules/plataformas/domain/credenciales';
import { leerCodigoDeAcceso } from '@/modules/plataformas/application/codigo-de-acceso';
import { esquemaId } from '@/modules/usuarios/domain/esquemas';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../../../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../../../_servidor/peticion';

/**
 * Acciones de Ajustes → Plataformas. La contraseña solo pasa por aquí hacia el caso de uso, que la
 * cifra: nunca se devuelve en el estado del formulario ni se registra.
 */

const esquemaCredencial = z.object({
  plataforma: z.enum(PLATAFORMAS_CON_CREDENCIALES),
  alcance: z.enum(ALCANCES_DE_CREDENCIAL).default('PERSONAL'),
  usuario: z
    .string()
    .trim()
    .min(1, 'Escribe tu usuario de la plataforma.')
    .max(200, 'El usuario es demasiado largo.'),
  secreto: z
    .string()
    .min(1, 'Escribe la contraseña.')
    .max(500, 'La contraseña es demasiado larga.'),
  consiente: z.literal('si', {
    error: 'Para guardar la credencial debes autorizar a LURIS a usarla.',
  }),
});

export async function guardarCredencialAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  // Para volver a llenar el formulario si hay errores (nunca la contraseña).
  const conservar = { usuario: valores.usuario ?? '', alcance: valores.alcance ?? 'PERSONAL' };
  const datos = esquemaCredencial.safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'guardar-credencial', conservar);
    const resultado = await casos.guardarCredencial(sesion.value, {
      plataforma: datos.data.plataforma,
      alcance: datos.data.alcance,
      usuario: datos.data.usuario,
      secreto: datos.data.secreto,
      consiente: true,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'guardar-credencial', conservar);
  } catch (error) {
    return estadoDeError(error, 'guardar-credencial', conservar);
  }
  refresh();
  return {
    tipo: 'exito',
    mensaje:
      'Credencial guardada. LURIS está probando el acceso: recarga la página en unos segundos para ver el resultado.',
  };
}

export async function ingresarCodigoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z
    .object({
      credencialId: esquemaId,
      codigo: z
        .string()
        .trim()
        .min(1, 'Escribe el código que te llegó.')
        .refine((texto) => leerCodigoDeAcceso(texto) !== null, {
          message: 'Escribe el código tal como te llegó: entre 4 y 12 letras o números.',
        }),
    })
    .safeParse(textosDe(formulario));
  // El código nunca se devuelve en el estado del formulario.
  if (!datos.success) return estadoDeValidacion(datos.error);
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'codigo-de-acceso');
    const resultado = await casos.ingresarCodigoDeAcceso(sesion.value, {
      ...datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'codigo-de-acceso');
  } catch (error) {
    return estadoDeError(error, 'codigo-de-acceso');
  }
  refresh();
  return {
    tipo: 'exito',
    mensaje:
      'Código enviado. LURIS terminará de ingresar y consultará tus procesos; recarga la página en unos segundos para ver el resultado.',
  };
}

export async function eliminarCredencialAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z.object({ id: esquemaId }).safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'eliminar-credencial');
    const resultado = await casos.eliminarCredencial(sesion.value, {
      id: datos.data.id,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'eliminar-credencial');
  } catch (error) {
    return estadoDeError(error, 'eliminar-credencial');
  }
  refresh();
  return { tipo: 'exito', mensaje: 'Credencial eliminada. LURIS ya no la usará.' };
}
