import { AppError } from '@/shared/domain/app-error';
import type { Result } from '@/shared/domain/result';
import type { Aviso, CanalDeAviso } from './aviso';

export const CODIGOS_DE_ERROR_DE_ENVIO = [
  /** El destino no sirve (correo o número inválido, WhatsApp no registrado): reintentar no ayuda. */
  'DESTINO_INVALIDO',
  /** El canal no está configurado o conectado (SMTP sin configurar, WhatsApp sin vincular). */
  'CANAL_NO_DISPONIBLE',
  /** El servicio rechazó el mensaje (límite, política, contenido). */
  'RECHAZADO',
  /** Falló por algo pasajero (red, servicio caído): se reintenta. */
  'FALLO_TEMPORAL',
] as const;
export type CodigoDeErrorDeEnvio = (typeof CODIGOS_DE_ERROR_DE_ENVIO)[number];

/** Por qué no salió un aviso. El detalle técnico va al log; la persona ve solo `mensajeUsuario`. */
export class ErrorDeEnvio extends AppError {
  readonly codigoDeEnvio: CodigoDeErrorDeEnvio;
  /** Vale la pena reintentar más tarde. */
  readonly transitorio: boolean;

  constructor(codigo: CodigoDeErrorDeEnvio, detalleTecnico?: string) {
    super({ codigo: `ENVIO_${codigo}`, mensajeUsuario: MENSAJES[codigo], detalleTecnico });
    this.codigoDeEnvio = codigo;
    this.transitorio = codigo === 'FALLO_TEMPORAL' || codigo === 'CANAL_NO_DISPONIBLE';
  }
}

const MENSAJES: Readonly<Record<CodigoDeErrorDeEnvio, string>> = {
  DESTINO_INVALIDO:
    'No pudimos entregar el aviso: el correo o el número de WhatsApp parece no ser válido. Revísalo en Notificaciones.',
  CANAL_NO_DISPONIBLE:
    'El canal para enviar este aviso no está disponible por ahora. Lo volveremos a intentar.',
  RECHAZADO: 'El servicio de mensajes rechazó el aviso. Si se repite, avisa al administrador.',
  FALLO_TEMPORAL: 'No pudimos enviar el aviso por un problema pasajero. Lo volveremos a intentar.',
};

/**
 * Puerto de un canal de notificación (§9). Agregar un canal es agregar un adaptador que lo
 * implemente: no se tocan los casos de uso. Las implementaciones nunca registran el contenido.
 */
export interface ContextoDeEnvio {
  /** Despacho que envía: WhatsApp se envía con la sesión de cada despacho. */
  readonly despachoId: string;
}

export interface Notificador {
  readonly canal: CanalDeAviso;
  enviar(aviso: Aviso, contexto: ContextoDeEnvio): Promise<Result<void, ErrorDeEnvio>>;
}

/** Qué le pasó a un aviso, para la persona (la lista de Notificaciones). */
export function mensajeDeEstadoDeAviso(
  estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA',
  codigoError: string | null,
): string {
  if (estado === 'ENVIADA') return 'Enviada';
  if (codigoError === 'CANAL_DESACTIVADO') {
    return 'No se envió: desactivaste este canal antes de que saliera.';
  }
  const codigo = CODIGOS_DE_ERROR_DE_ENVIO.find((c) => c === codigoError);
  if (estado === 'FALLIDA') {
    return codigo ? MENSAJES[codigo] : 'No pudimos enviar este aviso.';
  }
  return codigo ? `Reintentando: ${MENSAJES[codigo]}` : 'En cola: sale en unos minutos.';
}
