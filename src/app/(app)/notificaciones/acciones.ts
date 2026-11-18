'use server';

import { refresh } from 'next/cache';
import { esquemaDePreferencias } from '@/modules/notificaciones/domain/preferencias';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../../_servidor/peticion';

/**
 * Guarda las preferencias de notificación de quien las envía. Valida con Zod (los errores van junto
 * a cada campo) y deja que el caso de uso verifique el permiso y audite el cambio.
 */
export async function guardarPreferenciasAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const valores = textosDe(formulario);
  const conservar = {
    correoActivo: valores.correoActivo ?? '',
    whatsappActivo: valores.whatsappActivo ?? '',
    numeroWhatsapp: valores.numeroWhatsapp ?? '',
    consentimientoWhatsapp: valores.consentimientoWhatsapp ?? '',
    frecuencia: valores.frecuencia ?? '',
  };
  const datos = esquemaDePreferencias.safeParse({
    correoActivo: valores.correoActivo === 'si',
    whatsappActivo: valores.whatsappActivo === 'si',
    numeroWhatsapp: valores.numeroWhatsapp ?? '',
    consentimientoWhatsapp: valores.consentimientoWhatsapp === 'si',
    frecuencia: valores.frecuencia,
  });
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return estadoDeError(sesion.error, 'guardar-preferencias', conservar);
    const resultado = await casos.guardarPreferenciasDeNotificacion(sesion.value, {
      entrada: datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'guardar-preferencias', conservar);
    refresh();
    return { tipo: 'exito', mensaje: 'Guardamos tus preferencias de notificación.' };
  } catch (error) {
    return estadoDeError(error, 'guardar-preferencias', conservar);
  }
}
