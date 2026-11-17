import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { alcanceDe } from '@/modules/usuarios/domain/permisos';
import {
  AppError,
  ErrorDeValidacion,
  ErrorNoEncontrado,
  ErrorSinPermiso,
} from '@/shared/domain/app-error';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  type AlcanceDeCredencial,
  contextoDeCifrado,
  type PlataformaConCredenciales,
} from '../domain/credenciales';
import type { ErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { ContextoConsulta, VerificadorDeAcceso } from '../domain/puertos';
import type {
  CifradorDeCredenciales,
  ColaDeTrabajos,
  CredencialResumida,
  Reloj,
  RepositorioDeCredenciales,
} from './puertos';

/**
 * Credenciales de plataformas en Ajustes → Plataformas (§5: el administrador gestiona las del
 * despacho; el abogado, las suyas; el asistente, ninguna). El secreto se cifra antes de guardarlo
 * y nunca sale del servidor: ni en la interfaz, ni en la auditoría, ni en los logs.
 */

export class ErrorCifradoNoConfigurado extends AppError {
  constructor() {
    super({
      codigo: 'CIFRADO_NO_CONFIGURADO',
      mensajeUsuario:
        'Todavía no se pueden guardar contraseñas de plataformas: falta configurar el cifrado en el servidor. Avísale a quien administra LURIS.',
      detalleTecnico: 'Falta CREDENCIALES_CLAVE',
    });
  }
}

const NO_ENCONTRADA = 'No encontramos esa credencial. Recarga la página.';

export interface DependenciasDeCredenciales {
  readonly credenciales: RepositorioDeCredenciales;
  /** null si el servidor no tiene clave de cifrado configurada. */
  readonly cifrador: CifradorDeCredenciales | null;
  readonly cola: ColaDeTrabajos;
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: Reloj;
}

function puedeLasDelDespacho(perfil: Parameters<typeof alcanceDe>[0]): boolean {
  return alcanceDe(perfil, 'CREDENCIALES_GESTIONAR') === 'TODOS';
}

export function crearListarCredenciales(deps: Pick<DependenciasDeCredenciales, 'credenciales'>) {
  return async function listarCredenciales(
    contexto: ContextoDeSesion,
  ): Promise<Result<readonly CredencialResumida[], AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CREDENCIALES_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    return ok(
      await deps.credenciales.listar(actor.despacho.id, {
        membresiaId: actor.membresiaId,
        incluirDelDespacho: puedeLasDelDespacho(actor.perfil),
      }),
    );
  };
}

export interface CredencialNueva {
  readonly plataforma: PlataformaConCredenciales;
  readonly alcance: AlcanceDeCredencial;
  readonly usuario: string;
  readonly secreto: string;
  /** Aceptó el texto de consentimiento (§6). */
  readonly consiente: boolean;
  readonly ip: string | null;
}

export function crearGuardarCredencial(deps: DependenciasDeCredenciales) {
  return async function guardarCredencial(
    contexto: ContextoDeSesion,
    nueva: CredencialNueva,
  ): Promise<Result<{ readonly id: string }, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CREDENCIALES_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    if (nueva.alcance === 'DESPACHO' && !puedeLasDelDespacho(actor.perfil)) {
      return err(
        new ErrorSinPermiso(
          'Solo el administrador del despacho puede guardar credenciales del despacho.',
        ),
      );
    }
    if (!nueva.consiente) {
      return err(
        new ErrorDeValidacion(
          { consiente: ['Para guardar la credencial debes autorizar a LURIS a usarla.'] },
          'Falta tu autorización para guardar la credencial.',
        ),
      );
    }
    if (!deps.cifrador) return err(new ErrorCifradoNoConfigurado());

    const datos = {
      despachoId: actor.despacho.id,
      plataforma: nueva.plataforma,
      alcance: nueva.alcance,
      membresiaId: actor.membresiaId,
      usuario: nueva.usuario,
    };
    const ahora = deps.reloj.ahora();
    const { id } = await deps.credenciales.guardar(actor.despacho.id, {
      ...datos,
      secreto: deps.cifrador.cifrar(nueva.secreto, contextoDeCifrado(datos)),
      consentimientoEn: ahora,
    });
    await deps.cola.encolarVerificacion({ despachoId: actor.despacho.id, credencialId: id });
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'CREDENCIAL_GUARDADA',
      entidad: 'CredencialPlataforma',
      entidadId: id,
      datos: { plataforma: nueva.plataforma, alcance: nueva.alcance },
      ip: nueva.ip,
    });
    return ok({ id });
  };
}

export function crearEliminarCredencial(
  deps: Pick<DependenciasDeCredenciales, 'credenciales' | 'auditoria'>,
) {
  return async function eliminarCredencial(
    contexto: ContextoDeSesion,
    solicitud: { readonly id: string; readonly ip: string | null },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CREDENCIALES_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const credencial = await deps.credenciales.buscar(actor.despacho.id, solicitud.id);
    const esSuya =
      credencial?.alcance === 'PERSONAL' && credencial.membresiaId === actor.membresiaId;
    // El administrador puede borrar cualquiera del despacho (p. ej. la de alguien que se fue).
    if (!credencial || (!esSuya && !puedeLasDelDespacho(actor.perfil))) {
      return err(new ErrorNoEncontrado(NO_ENCONTRADA, `Credencial ${solicitud.id}`));
    }
    await deps.credenciales.eliminar(actor.despacho.id, credencial.id);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'CREDENCIAL_ELIMINADA',
      entidad: 'CredencialPlataforma',
      entidadId: credencial.id,
      datos: { plataforma: credencial.plataforma, alcance: credencial.alcance },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}

/**
 * Prueba el acceso de una credencial (lo ejecuta el worker al guardarla). Un fallo pasajero de
 * la plataforma se devuelve para que la cola reintente; el resto queda como resultado.
 */
export function crearVerificarCredencial(deps: {
  readonly credenciales: RepositorioDeCredenciales;
  readonly cifrador: CifradorDeCredenciales | null;
  readonly verificadores: ReadonlyMap<CodigoPlataforma, VerificadorDeAcceso>;
  readonly reloj: Reloj;
  readonly logger: Logger;
}) {
  return async function verificarCredencial(
    solicitud: { readonly despachoId: string; readonly credencialId: string },
    ctx: ContextoConsulta,
  ): Promise<Result<void, ErrorPlataforma>> {
    const { despachoId, credencialId } = solicitud;
    const credencial = await deps.credenciales.buscar(despachoId, credencialId);
    const verificador = credencial ? deps.verificadores.get(credencial.plataforma) : undefined;
    if (!credencial || !verificador) return ok(undefined);

    const secreto = deps.cifrador?.descifrar(credencial.secreto, contextoDeCifrado(credencial));
    if (!secreto) {
      deps.logger.error('No se pudo descifrar una credencial', { despachoId, credencialId });
      await deps.credenciales.registrarVerificacion(
        despachoId,
        credencialId,
        'REQUIERE_INTERVENCION',
        deps.reloj.ahora(),
      );
      return ok(undefined);
    }

    const resultado = await verificador.verificar(credencial.usuario, secreto, ctx);
    if (!resultado.ok && resultado.error.transitorio) return resultado;
    await deps.credenciales.registrarVerificacion(
      despachoId,
      credencialId,
      resultado.ok ? 'EXITOSA' : resultado.error.codigo,
      deps.reloj.ahora(),
    );
    return ok(undefined);
  };
}
