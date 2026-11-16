import type { RolDeDespacho } from './rol-de-despacho';

/**
 * Invitación a un despacho (§5): enlace de un solo uso, con vencimiento. El enlace lleva un
 * token aleatorio; en la base solo se guarda su hash, así una filtración de la base no permite
 * aceptar invitaciones.
 */
export type EstadoInvitacion = 'PENDIENTE' | 'ACEPTADA' | 'CANCELADA';

export interface Invitacion {
  readonly id: string;
  readonly despachoId: string;
  readonly email: string;
  readonly rol: RolDeDespacho;
  readonly estado: EstadoInvitacion;
  readonly expiraEn: Date;
  readonly creadaEn: Date;
}

export function estaVigente(invitacion: Invitacion, ahora: Date): boolean {
  return invitacion.estado === 'PENDIENTE' && invitacion.expiraEn.getTime() > ahora.getTime();
}

export function calcularVencimiento(ahora: Date, horasDeVigencia: number): Date {
  return new Date(ahora.getTime() + horasDeVigencia * 60 * 60 * 1000);
}
