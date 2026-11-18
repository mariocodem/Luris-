import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { CifradorDeCredenciales } from '@/modules/plataformas/application/puertos';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
  type ContextoMiembro,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { AppError, ErrorSinPermiso } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  contextoDeQrWhatsapp,
  SEGUNDOS_DE_VIGENCIA_DEL_QR,
  SEGUNDOS_PARA_QUE_RESPONDA_EL_WORKER,
} from '../domain/whatsapp';
import type {
  ColaDeWhatsapp,
  EstadoDeLaSesion,
  Reloj,
  RepositorioDeSesionDeWhatsapp,
} from './puertos';

export class ErrorDeWhatsapp extends AppError {
  constructor(mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: 'WHATSAPP', mensajeUsuario, detalleTecnico });
  }
}

export interface DependenciasDeWhatsapp {
  readonly sesiones: RepositorioDeSesionDeWhatsapp;
  readonly cola: ColaDeWhatsapp;
  /** Null si el servidor no tiene la clave de cifrado: sin ella no se guarda ninguna sesión. */
  readonly cifrador: CifradorDeCredenciales | null;
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: Reloj;
}

/** Solo el administrador del despacho gestiona el WhatsApp del despacho (§9). */
function exigirAdministrador(contexto: ContextoDeSesion): Result<ContextoMiembro, AppError> {
  const permiso = exigirMiembroConPermiso(contexto, 'NOTIFICACIONES_CONFIGURAR');
  if (!permiso.ok) return permiso;
  if (permiso.value.perfil !== 'administrador') {
    return err(
      new ErrorSinPermiso(
        'Solo el administrador del despacho puede vincular el WhatsApp de LURIS.',
        `${permiso.value.perfil} intentó gestionar WhatsApp`,
      ),
    );
  }
  return permiso;
}

export interface EstadoDeWhatsapp {
  readonly estado: EstadoDeLaSesion;
  /** El servidor puede guardar sesiones (tiene la clave de cifrado). */
  readonly disponible: boolean;
  readonly numero: string | null;
  readonly conectadaEn: Date | null;
  /** QR vigente para escanear, en texto (la pantalla lo dibuja). */
  readonly qr: string | null;
  /** El servicio de segundo plano no respondió a tiempo a la orden de vincular. */
  readonly sinRespuesta: boolean;
}

export function crearObtenerEstadoDeWhatsapp(deps: DependenciasDeWhatsapp) {
  return async function obtenerEstadoDeWhatsapp(
    contexto: ContextoDeSesion,
  ): Promise<Result<EstadoDeWhatsapp, AppError>> {
    const permiso = exigirAdministrador(contexto);
    if (!permiso.ok) return permiso;
    const despachoId = permiso.value.despacho.id;
    const sesion = await deps.sesiones.obtener(despachoId);
    const ahora = deps.reloj.ahora().getTime();

    let qr: string | null = null;
    const vigente =
      sesion.qrGeneradoEn !== null &&
      ahora - sesion.qrGeneradoEn.getTime() < SEGUNDOS_DE_VIGENCIA_DEL_QR * 1000;
    if (sesion.estado === 'VINCULANDO' && vigente && sesion.qr && deps.cifrador) {
      qr = deps.cifrador.descifrar(sesion.qr, contextoDeQrWhatsapp(despachoId));
    }
    const sinRespuesta =
      sesion.estado === 'VINCULANDO' &&
      qr === null &&
      sesion.vinculacionSolicitadaEn !== null &&
      ahora - sesion.vinculacionSolicitadaEn.getTime() >
        SEGUNDOS_PARA_QUE_RESPONDA_EL_WORKER * 1000;
    return ok({
      estado: sesion.estado,
      disponible: deps.cifrador !== null,
      numero: sesion.numero,
      conectadaEn: sesion.conectadaEn,
      qr,
      sinRespuesta,
    });
  };
}

/** Pide al worker que empiece a vincular: mostrará un QR para escanear con el WhatsApp del número dedicado. */
export function crearVincularWhatsapp(deps: DependenciasDeWhatsapp) {
  return async function vincularWhatsapp(
    contexto: ContextoDeSesion,
    solicitud: { readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirAdministrador(contexto);
    if (!permiso.ok) return permiso;
    if (!deps.cifrador) {
      return err(
        new ErrorDeWhatsapp(
          'Este servidor no tiene configurada la clave para guardar la sesión de WhatsApp de forma cifrada. Pide a quien instaló LURIS que la configure.',
          'Falta CREDENCIALES_CLAVE',
        ),
      );
    }
    const despachoId = permiso.value.despacho.id;
    const sesion = await deps.sesiones.obtener(despachoId);
    if (sesion.estado === 'CONECTADA') {
      return err(
        new ErrorDeWhatsapp(
          'WhatsApp ya está vinculado. Desvincúlalo primero si quieres cambiar de número.',
        ),
      );
    }
    await deps.sesiones.solicitarVinculacion(despachoId, deps.reloj.ahora());
    await deps.cola.encolarVinculacion(despachoId);
    await deps.auditoria.registrar({
      despachoId,
      actorId: permiso.value.usuarioId,
      accion: 'WHATSAPP_VINCULACION_SOLICITADA',
      entidad: 'SesionWhatsapp',
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}

export function crearDesvincularWhatsapp(deps: DependenciasDeWhatsapp) {
  return async function desvincularWhatsapp(
    contexto: ContextoDeSesion,
    solicitud: { readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirAdministrador(contexto);
    if (!permiso.ok) return permiso;
    const despachoId = permiso.value.despacho.id;
    await deps.cola.encolarDesvinculacion(despachoId);
    // Se refleja de inmediato; el worker cierra la sesión en WhatsApp y borra las claves.
    await deps.sesiones.reiniciar(despachoId);
    await deps.auditoria.registrar({
      despachoId,
      actorId: permiso.value.usuarioId,
      accion: 'WHATSAPP_DESVINCULADO',
      entidad: 'SesionWhatsapp',
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}
