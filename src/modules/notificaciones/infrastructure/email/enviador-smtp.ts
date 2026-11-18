import nodemailer from 'nodemailer';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { CorreoSaliente, EnviadorDeCorreos } from '../../domain/enviador-de-correos';
import { ErrorDeEnvio, type CodigoDeErrorDeEnvio } from '../../domain/notificador';

interface ErrorDeNodemailer {
  readonly code?: string;
  readonly responseCode?: number;
}

/**
 * Clasifica un fallo de SMTP sin mirar su texto (puede llevar direcciones): por el código de
 * respuesta (5xx = rechazo; 4xx = pasajero) o el código de conexión de nodemailer.
 */
export function clasificarFalloDeSmtp(causa: unknown): CodigoDeErrorDeEnvio {
  const { code, responseCode } = (causa ?? {}) as ErrorDeNodemailer;
  if (code === 'EAUTH' || code === 'ESOCKET' || code === 'ECONNECTION' || code === 'ETIMEDOUT') {
    return code === 'EAUTH' ? 'CANAL_NO_DISPONIBLE' : 'FALLO_TEMPORAL';
  }
  if (code === 'EENVELOPE') return 'DESTINO_INVALIDO';
  if (typeof responseCode === 'number') {
    if (responseCode >= 400 && responseCode < 500) return 'FALLO_TEMPORAL';
    if ([550, 551, 553].includes(responseCode)) return 'DESTINO_INVALIDO';
    return 'RECHAZADO';
  }
  return 'FALLO_TEMPORAL';
}

/**
 * Envío por SMTP (§9). Nunca registra el contenido del correo ni su destinatario: solo el código
 * de fallo. Los errores salen como `ErrorDeEnvio`, que dice si vale la pena reintentar.
 */
export function crearEnviadorSmtp(opciones: {
  readonly host: string;
  readonly puerto: number;
  /** TLS implícito (puerto 465). Con false se negocia STARTTLS si el servidor lo ofrece. */
  readonly seguro: boolean;
  readonly usuario?: string;
  readonly clave?: string;
  readonly remitente: string;
  readonly logger: Logger;
}): EnviadorDeCorreos {
  const transporte = nodemailer.createTransport({
    host: opciones.host,
    port: opciones.puerto,
    secure: opciones.seguro,
    ...(opciones.usuario && opciones.clave
      ? { auth: { user: opciones.usuario, pass: opciones.clave } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  return {
    async enviar(correo: CorreoSaliente) {
      try {
        await transporte.sendMail({
          from: opciones.remitente,
          to: correo.para,
          subject: correo.asunto,
          text: correo.texto,
          html: correo.html,
        });
        return ok(undefined);
      } catch (causa) {
        const codigo = clasificarFalloDeSmtp(causa);
        const { code, responseCode } = (causa ?? {}) as ErrorDeNodemailer;
        opciones.logger.warn('El servidor de correo no aceptó el mensaje', {
          codigo,
          codigoSmtp: code,
          respuestaSmtp: responseCode,
        });
        return err(new ErrorDeEnvio(codigo, `SMTP ${code ?? ''} ${responseCode ?? ''}`.trim()));
      }
    },
  };
}
