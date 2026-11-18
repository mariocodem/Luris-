'use server';

import QRCode from 'qrcode';
import { refresh } from 'next/cache';
import { casosDeUso, ipDeLaPeticion, registrarSiEsInesperado } from '../../../_servidor/peticion';

/**
 * Acciones de Ajustes → WhatsApp (solo el administrador del despacho). El QR llega del worker
 * cifrado; aquí se descifra y se convierte en una matriz de módulos para dibujarlo, y solo se
 * entrega a quien tiene la sesión de administrador.
 */

export interface EstadoDeWhatsappParaLaPantalla {
  readonly estado: 'SIN_VINCULAR' | 'VINCULANDO' | 'CONECTADA' | 'DESCONECTADA';
  readonly disponible: boolean;
  readonly numero: string | null;
  /** Filas de «0» y «1» del QR (1 = módulo oscuro), o null si no hay uno vigente. */
  readonly qr: readonly string[] | null;
  readonly sinRespuesta: boolean;
}

export type RespuestaDeWhatsapp =
  | { readonly ok: true; readonly estado: EstadoDeWhatsappParaLaPantalla }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

function fallo(valor: unknown, operacion: string): RespuestaDeWhatsapp {
  const error = registrarSiEsInesperado(valor, operacion);
  return {
    ok: false,
    mensaje: error.mensajeUsuario,
    ...(error.codigo === 'INESPERADO' && { codigoDeAyuda: error.codigoDeAyuda }),
  };
}

/** Filas de módulos del QR. Corrección de errores media: el código de WhatsApp es denso. */
function filasDelQr(texto: string): string[] {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const filas: string[] = [];
  for (let y = 0; y < modules.size; y += 1) {
    let fila = '';
    for (let x = 0; x < modules.size; x += 1) fila += modules.get(x, y) ? '1' : '0';
    filas.push(fila);
  }
  return filas;
}

export async function estadoDeWhatsappAccion(): Promise<RespuestaDeWhatsapp> {
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'estado-whatsapp');
    const estado = await casos.obtenerEstadoDeWhatsapp(sesion.value);
    if (!estado.ok) return fallo(estado.error, 'estado-whatsapp');
    const { qr, ...resto } = estado.value;
    return {
      ok: true,
      estado: {
        estado: resto.estado,
        disponible: resto.disponible,
        numero: resto.numero,
        sinRespuesta: resto.sinRespuesta,
        qr: qr ? filasDelQr(qr) : null,
      },
    };
  } catch (error) {
    return fallo(error, 'estado-whatsapp');
  }
}

export async function vincularWhatsappAccion(): Promise<RespuestaDeWhatsapp> {
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'vincular-whatsapp');
    const resultado = await casos.vincularWhatsapp(sesion.value, { ip: await ipDeLaPeticion() });
    if (!resultado.ok) return fallo(resultado.error, 'vincular-whatsapp');
    refresh();
    return estadoDeWhatsappAccion();
  } catch (error) {
    return fallo(error, 'vincular-whatsapp');
  }
}

export async function desvincularWhatsappAccion(): Promise<RespuestaDeWhatsapp> {
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'desvincular-whatsapp');
    const resultado = await casos.desvincularWhatsapp(sesion.value, { ip: await ipDeLaPeticion() });
    if (!resultado.ok) return fallo(resultado.error, 'desvincular-whatsapp');
    refresh();
    return estadoDeWhatsappAccion();
  } catch (error) {
    return fallo(error, 'desvincular-whatsapp');
  }
}
