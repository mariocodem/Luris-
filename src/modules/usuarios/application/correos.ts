import type { CorreoSaliente } from '@/modules/notificaciones/domain/enviador-de-correos';
import type { RolDeDespacho } from '../domain/rol-de-despacho';

/**
 * Plantillas de los correos de cuenta. En la Fase 11 se pasan a React Email; el contenido y
 * los datos que reciben se mantienen.
 */

const NOMBRE_DEL_ROL: Readonly<Record<RolDeDespacho, string>> = {
  administrador: 'Administrador del despacho',
  abogado: 'Abogado',
  asistente: 'Asistente',
};

export function nombreDelRol(rol: RolDeDespacho): string {
  return NOMBRE_DEL_ROL[rol];
}

function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatoFecha(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(fecha);
}

function boton(url: string, texto: string): string {
  return `<p><a href="${escapar(url)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escapar(texto)}</a></p>
<p style="color:#555;font-size:14px">Si el botón no funciona, copia este enlace en tu navegador:<br>${escapar(url)}</p>`;
}

export function correoDeInvitacion(datos: {
  readonly para: string;
  readonly despacho: string;
  readonly invitadoPor: string;
  readonly rol: RolDeDespacho;
  readonly url: string;
  readonly expiraEn: Date;
}): CorreoSaliente {
  const rol = nombreDelRol(datos.rol);
  const vence = formatoFecha(datos.expiraEn);
  return {
    para: datos.para,
    asunto: `Te invitaron a ${datos.despacho} en LURIS`,
    texto: [
      `${datos.invitadoPor} te invitó a unirte a ${datos.despacho} en LURIS con el rol ${rol}.`,
      '',
      `Para aceptar y crear tu contraseña, abre este enlace: ${datos.url}`,
      '',
      `El enlace sirve una sola vez y vence el ${vence}.`,
      'Si no esperabas esta invitación, ignora este correo.',
    ].join('\n'),
    html: `<p>${escapar(datos.invitadoPor)} te invitó a unirte a <strong>${escapar(datos.despacho)}</strong> en LURIS con el rol <strong>${escapar(rol)}</strong>.</p>
${boton(datos.url, 'Aceptar invitación')}
<p>El enlace sirve una sola vez y vence el ${escapar(vence)}.</p>
<p style="color:#555">Si no esperabas esta invitación, ignora este correo.</p>`,
  };
}

export function correoDeRecuperacion(datos: {
  readonly para: string;
  readonly nombre: string;
  readonly url: string;
  readonly minutosDeVigencia: number;
}): CorreoSaliente {
  return {
    para: datos.para,
    asunto: 'Cambia tu contraseña de LURIS',
    texto: [
      `Hola, ${datos.nombre}.`,
      '',
      `Recibimos una solicitud para cambiar tu contraseña. Abre este enlace para elegir una nueva: ${datos.url}`,
      '',
      `El enlace sirve una sola vez y vence en ${datos.minutosDeVigencia} minutos.`,
      'Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.',
    ].join('\n'),
    html: `<p>Hola, ${escapar(datos.nombre)}.</p>
<p>Recibimos una solicitud para cambiar tu contraseña de LURIS.</p>
${boton(datos.url, 'Elegir una contraseña nueva')}
<p>El enlace sirve una sola vez y vence en ${datos.minutosDeVigencia} minutos.</p>
<p style="color:#555">Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.</p>`,
  };
}
