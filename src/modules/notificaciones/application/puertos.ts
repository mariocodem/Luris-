import type { SecretoCifrado } from '@/modules/plataformas/application/puertos';
import type { ConteoDeItems } from '@/modules/plataformas/domain/consulta-masiva';
import type { ActuacionAvisada, CanalDeAviso, ProcesoAvisado } from '../domain/aviso';
import type { PreferenciasDeNotificacion } from '../domain/preferencias';

/**
 * Puertos de las notificaciones (§9). Las implementaciones (Prisma, pg-boss) se conectan en
 * composition-root.ts.
 */

export interface Reloj {
  ahora(): Date;
}

/** Persona a la que podría avisarse de un proceso, con sus preferencias ya resueltas. */
export interface DestinatarioPosible {
  readonly membresiaId: string;
  readonly nombre: string;
  readonly email: string;
  readonly preferencias: PreferenciasDeNotificacion;
}

export interface NotificacionAProgramar {
  readonly actuacionId: string;
  readonly membresiaId: string;
  readonly canal: CanalDeAviso;
  readonly programadaPara: Date;
}

/** Un aviso pendiente que ya toca enviar, con todo lo necesario para armarlo. */
export interface NotificacionPorEnviar {
  readonly id: string;
  readonly membresiaId: string;
  readonly canal: CanalDeAviso;
  /** Intentos contando el que se está haciendo. */
  readonly intentos: number;
  readonly destinatario: {
    readonly nombre: string;
    readonly email: string;
    readonly preferencias: PreferenciasDeNotificacion;
  };
  readonly proceso: Omit<ProcesoAvisado, 'actuaciones'>;
  readonly actuacion: ActuacionAvisada;
}

export interface NotificacionDeLaPersona {
  readonly id: string;
  readonly canal: CanalDeAviso;
  readonly estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  readonly codigoError: string | null;
  readonly programadaPara: Date;
  readonly enviadaEn: Date | null;
  readonly proceso: Omit<ProcesoAvisado, 'actuaciones'>;
  readonly actuacion: ActuacionAvisada;
}

export interface LoteTerminadoSinAviso {
  readonly consultaId: string;
  readonly destinatario: {
    readonly nombre: string;
    readonly email: string;
    readonly preferencias: PreferenciasDeNotificacion;
  };
  readonly procesos: number;
  readonly conteo: ConteoDeItems;
}

export interface RepositorioDeNotificaciones {
  /**
   * A quién avisar de un proceso: las personas activas asignadas a él (responsable y apoyo) o, si
   * no tiene a nadie asignado, las administradoras del despacho.
   */
  destinatariosDeProceso(
    despachoId: string,
    procesoId: string,
  ): Promise<readonly DestinatarioPosible[]>;
  /**
   * Guarda los avisos por enviar. La clave única (actuación, persona, canal) garantiza la
   * idempotencia: repetir la llamada no duplica nada. Devuelve cuántos creó.
   */
  programar(despachoId: string, filas: readonly NotificacionAProgramar[]): Promise<number>;
  /**
   * Toma los avisos que ya vencen y los arrienda: suma un intento y los posterga `arriendoMs`, de
   * modo que otro despachador no los tome mientras se envían (y se reintenten solos si el
   * proceso se cae a mitad del envío).
   */
  reclamarVencidas(
    despachoId: string,
    opciones: { readonly ahora: Date; readonly limite: number; readonly arriendoMs: number },
  ): Promise<readonly NotificacionPorEnviar[]>;
  marcarEnviadas(despachoId: string, ids: readonly string[], ahora: Date): Promise<void>;
  /** Fallo definitivo: no se reintenta. */
  marcarFallidas(despachoId: string, ids: readonly string[], codigoError: string): Promise<void>;
  /** Fallo pasajero: vuelve a la cola para `para`. */
  reprogramar(
    despachoId: string,
    ids: readonly string[],
    para: Date,
    codigoError: string,
  ): Promise<void>;
  /** Los avisos recientes de una persona, los más nuevos primero. */
  deLaPersona(
    despachoId: string,
    membresiaId: string,
    limite: number,
  ): Promise<readonly NotificacionDeLaPersona[]>;

  /** Consultas masivas terminadas desde `desde` de las que aún no se avisó (§7). */
  lotesTerminadosSinAviso(
    despachoId: string,
    desde: Date,
  ): Promise<readonly LoteTerminadoSinAviso[]>;
  marcarLoteAvisado(despachoId: string, consultaId: string, ahora: Date): Promise<void>;

  obtenerPreferencias(
    despachoId: string,
    membresiaId: string,
  ): Promise<PreferenciasDeNotificacion | null>;
  guardarPreferencias(
    despachoId: string,
    membresiaId: string,
    preferencias: PreferenciasDeNotificacion,
  ): Promise<void>;
}

// ─── WhatsApp del despacho (§9) ───────────────────────────────────────────────

export type EstadoDeLaSesion = 'SIN_VINCULAR' | 'VINCULANDO' | 'CONECTADA' | 'DESCONECTADA';

export interface SesionDeWhatsapp {
  readonly estado: EstadoDeLaSesion;
  /** Número vinculado (solo dígitos). */
  readonly numero: string | null;
  /** QR vigente, cifrado. Solo existe mientras se espera el escaneo. */
  readonly qr: SecretoCifrado | null;
  readonly qrGeneradoEn: Date | null;
  readonly vinculacionSolicitadaEn: Date | null;
  readonly conectadaEn: Date | null;
}

export const SESION_SIN_VINCULAR: SesionDeWhatsapp = {
  estado: 'SIN_VINCULAR',
  numero: null,
  qr: null,
  qrGeneradoEn: null,
  vinculacionSolicitadaEn: null,
  conectadaEn: null,
};

export interface RepositorioDeSesionDeWhatsapp {
  obtener(despachoId: string): Promise<SesionDeWhatsapp>;
  /** Marca la vinculación como pedida (borra el QR anterior). */
  solicitarVinculacion(despachoId: string, ahora: Date): Promise<void>;
  /** Cambios que informa el worker; crea la fila si no existe. */
  actualizar(
    despachoId: string,
    cambios: Partial<{
      estado: EstadoDeLaSesion;
      numero: string | null;
      qr: SecretoCifrado | null;
      qrGeneradoEn: Date | null;
      vinculacionSolicitadaEn: Date | null;
      conectadaEn: Date | null;
    }>,
  ): Promise<void>;
  /** Credenciales y claves de la sesión, cifradas. */
  cargarDatos(despachoId: string): Promise<SecretoCifrado | null>;
  guardarDatos(despachoId: string, datos: SecretoCifrado): Promise<void>;
  /** Vuelve a «sin vincular» y borra credenciales, claves y QR. */
  reiniciar(despachoId: string): Promise<void>;
  /** Despachos con una sesión guardada (el worker las reconecta al iniciar). */
  despachosConSesion(): Promise<readonly string[]>;
}

/** Órdenes de la web al worker, que es quien mantiene la conexión de WhatsApp. */
export interface ColaDeWhatsapp {
  encolarVinculacion(despachoId: string): Promise<void>;
  encolarDesvinculacion(despachoId: string): Promise<void>;
}
