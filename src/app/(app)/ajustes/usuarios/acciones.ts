'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { esquemaEmail, esquemaId, esquemaRol } from '@/modules/usuarios/domain/esquemas';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../../../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../../../_servidor/peticion';

/**
 * Acciones del panel de usuarios. Cada una vuelve a leer la sesión y el caso de uso verifica el
 * permiso del §5: ocultar botones en la interfaz no es un control de acceso.
 */

async function contexto() {
  const casos = casosDeUso();
  return { casos, sesion: await casos.obtenerContextoDeSesion(), ip: await ipDeLaPeticion() };
}

export async function invitarAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const conservar = { email: valores.email ?? '', rol: valores.rol ?? '' };
  const datos = z.object({ email: esquemaEmail, rol: esquemaRol }).safeParse(valores);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'invitar');
    const resultado = await casos.invitarUsuario(sesion.value, { ...datos.data, ip });
    refresh();
    if (!resultado.ok) return estadoDeError(resultado.error, 'invitar', conservar);
  } catch (error) {
    return estadoDeError(error, 'invitar', conservar);
  }
  return { tipo: 'exito', mensaje: `Enviamos la invitación a ${datos.data.email}.` };
}

export async function cambiarRolAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z
    .object({ membresiaId: esquemaId, rol: esquemaRol })
    .safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'cambiar-rol');
    const resultado = await casos.cambiarRol(sesion.value, { ...datos.data, ip });
    if (!resultado.ok) return estadoDeError(resultado.error, 'cambiar-rol');
  } catch (error) {
    return estadoDeError(error, 'cambiar-rol');
  }
  refresh();
  return { tipo: 'exito', mensaje: 'Rol actualizado.' };
}

export async function cambiarEstadoDeCuentaAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z
    .object({ membresiaId: esquemaId, activa: z.enum(['si', 'no']) })
    .safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);
  const activa = datos.data.activa === 'si';

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'estado-de-cuenta');
    const resultado = await casos.cambiarEstadoDeCuenta(sesion.value, {
      membresiaId: datos.data.membresiaId,
      activa,
      ip,
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'estado-de-cuenta');
  } catch (error) {
    return estadoDeError(error, 'estado-de-cuenta');
  }
  refresh();
  return { tipo: 'exito', mensaje: activa ? 'Cuenta reactivada.' : 'Cuenta desactivada.' };
}

export async function cancelarInvitacionAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const datos = z.object({ invitacionId: esquemaId }).safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'cancelar-invitacion');
    const resultado = await casos.cancelarInvitacion(sesion.value, { ...datos.data, ip });
    if (!resultado.ok) return estadoDeError(resultado.error, 'cancelar-invitacion');
  } catch (error) {
    return estadoDeError(error, 'cancelar-invitacion');
  }
  refresh();
  return { tipo: 'exito', mensaje: 'Invitación cancelada.' };
}
