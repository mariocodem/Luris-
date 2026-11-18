import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { ok, type Result } from '@/shared/domain/result';
import {
  aplicarPreferencias,
  PREFERENCIAS_POR_DEFECTO,
  type EntradaDePreferencias,
  type PreferenciasDeNotificacion,
} from '../domain/preferencias';
import type { NotificacionDeLaPersona, Reloj, RepositorioDeNotificaciones } from './puertos';

/** Las preferencias de quien consulta (cada persona configura las suyas, §5). */
export function crearObtenerPreferencias(deps: {
  readonly repositorio: RepositorioDeNotificaciones;
}) {
  return async function obtenerPreferencias(
    contexto: ContextoDeSesion,
  ): Promise<
    Result<{ readonly preferencias: PreferenciasDeNotificacion; readonly email: string }, AppError>
  > {
    const permiso = exigirMiembroConPermiso(contexto, 'NOTIFICACIONES_CONFIGURAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const guardadas = await deps.repositorio.obtenerPreferencias(
      actor.despacho.id,
      actor.membresiaId,
    );
    return ok({ preferencias: guardadas ?? PREFERENCIAS_POR_DEFECTO, email: actor.email });
  };
}

/**
 * Guarda las preferencias de quien las envía. La entrada ya pasó por Zod en la frontera (el
 * consentimiento de WhatsApp y el número se validan ahí, junto a cada campo).
 */
export function crearGuardarPreferencias(deps: {
  readonly repositorio: RepositorioDeNotificaciones;
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: Reloj;
}) {
  return async function guardarPreferencias(
    contexto: ContextoDeSesion,
    solicitud: { readonly entrada: EntradaDePreferencias; readonly ip: string | null },
  ): Promise<Result<PreferenciasDeNotificacion, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'NOTIFICACIONES_CONFIGURAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const previas =
      (await deps.repositorio.obtenerPreferencias(actor.despacho.id, actor.membresiaId)) ??
      PREFERENCIAS_POR_DEFECTO;
    const nuevas = aplicarPreferencias(solicitud.entrada, previas, deps.reloj.ahora());
    await deps.repositorio.guardarPreferencias(actor.despacho.id, actor.membresiaId, nuevas);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'NOTIFICACIONES_PREFERENCIAS_ACTUALIZADAS',
      entidad: 'PreferenciaNotificacion',
      datos: {
        correo: nuevas.correoActivo,
        whatsapp: nuevas.whatsappActivo,
        frecuencia: nuevas.frecuencia,
      },
      ip: solicitud.ip,
    });
    return ok(nuevas);
  };
}

const AVISOS_EN_LA_LISTA = 100;

/** Los avisos recientes de la persona, con las fechas oficiales de cada actuación. */
export function crearListarNotificaciones(deps: {
  readonly repositorio: RepositorioDeNotificaciones;
}) {
  return async function listarNotificaciones(
    contexto: ContextoDeSesion,
  ): Promise<Result<readonly NotificacionDeLaPersona[], AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'NOTIFICACIONES_CONFIGURAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    return ok(
      await deps.repositorio.deLaPersona(actor.despacho.id, actor.membresiaId, AVISOS_EN_LA_LISTA),
    );
  };
}
