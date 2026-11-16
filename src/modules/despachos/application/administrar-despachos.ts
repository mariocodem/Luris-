import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  autorizarContexto,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import {
  emitirInvitacion,
  type DependenciasDeInvitaciones,
} from '@/modules/usuarios/application/invitaciones';
import { ErrorReglaDeCuenta } from '@/modules/usuarios/domain/errores';
import { type AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { generarSlug } from '../domain/slug';
import type { DespachoDetalle, RepositorioDeDespachos } from './puertos';

export interface DependenciasDeDespachos {
  readonly despachos: RepositorioDeDespachos;
  readonly auditoria: RegistradorDeAuditoria;
  readonly invitaciones: DependenciasDeInvitaciones;
}

export function crearListarDespachos(deps: Pick<DependenciasDeDespachos, 'despachos'>) {
  return async function listarDespachos(
    contexto: ContextoDeSesion,
  ): Promise<Result<readonly DespachoDetalle[], AppError>> {
    const permiso = autorizarContexto(contexto, 'DESPACHOS_GESTIONAR');
    if (!permiso.ok) return permiso;
    return ok(await deps.despachos.listar());
  };
}

/**
 * El superadmin crea un despacho e invita a su primer administrador. El superadmin no queda
 * como miembro: nunca ve los datos de procesos del despacho (§5).
 */
export function crearCrearDespacho(deps: DependenciasDeDespachos) {
  return async function crearDespacho(
    contexto: ContextoDeSesion,
    datos: {
      readonly nombre: string;
      readonly nit: string | null;
      readonly emailAdministrador: string;
      readonly ip: string | null;
    },
  ): Promise<Result<{ readonly despachoId: string; readonly correoEnviado: boolean }, AppError>> {
    const permiso = autorizarContexto(contexto, 'DESPACHOS_GESTIONAR');
    if (!permiso.ok) return permiso;

    const creado = await deps.despachos.crear({
      nombre: datos.nombre,
      slug: generarSlug(datos.nombre),
      nit: datos.nit,
    });
    if ('duplicado' in creado) {
      return err(
        creado.duplicado === 'nit'
          ? new ErrorReglaDeCuenta('NIT_DUPLICADO', 'Ya existe un despacho con ese NIT.')
          : new ErrorReglaDeCuenta(
              'NOMBRE_DUPLICADO',
              'Ya existe un despacho con un nombre muy parecido. Usa un nombre que lo distinga.',
            ),
      );
    }
    const despacho = creado.despacho;
    await deps.auditoria.registrar({
      despachoId: despacho.id,
      actorId: contexto.usuarioId,
      accion: 'DESPACHO_CREADO',
      entidad: 'Despacho',
      entidadId: despacho.id,
      datos: { nombre: despacho.nombre },
      ip: datos.ip,
    });

    const invitacion = await emitirInvitacion(deps.invitaciones, {
      despachoId: despacho.id,
      despachoNombre: despacho.nombre,
      email: datos.emailAdministrador,
      rol: 'administrador',
      invitadoPor: { id: contexto.usuarioId, nombre: contexto.nombre },
      ip: datos.ip,
    });
    // El despacho ya existe: si solo falló el correo, se informa sin deshacer la creación.
    if (!invitacion.ok && invitacion.error.codigo !== 'CORREO_NO_ENVIADO') return invitacion;
    return ok({ despachoId: despacho.id, correoEnviado: invitacion.ok });
  };
}

export function crearCambiarEstadoDeDespacho(deps: Omit<DependenciasDeDespachos, 'invitaciones'>) {
  return async function cambiarEstadoDeDespacho(
    contexto: ContextoDeSesion,
    datos: {
      readonly despachoId: string;
      readonly estado: 'ACTIVO' | 'SUSPENDIDO';
      readonly ip: string | null;
    },
  ): Promise<Result<void, AppError>> {
    const permiso = autorizarContexto(contexto, 'DESPACHOS_GESTIONAR');
    if (!permiso.ok) return permiso;

    const despacho = await deps.despachos.buscar(datos.despachoId);
    if (!despacho) return err(new ErrorNoEncontrado('No encontramos ese despacho.'));
    if (despacho.estado === datos.estado) {
      return err(
        new ErrorReglaDeCuenta(
          'ESTADO_SIN_CAMBIOS',
          datos.estado === 'SUSPENDIDO'
            ? 'Este despacho ya está suspendido.'
            : 'Este despacho ya está activo.',
        ),
      );
    }

    await deps.despachos.cambiarEstado(datos.despachoId, datos.estado);
    await deps.auditoria.registrar({
      despachoId: datos.despachoId,
      actorId: contexto.usuarioId,
      accion: datos.estado === 'SUSPENDIDO' ? 'DESPACHO_SUSPENDIDO' : 'DESPACHO_REACTIVADO',
      entidad: 'Despacho',
      entidadId: datos.despachoId,
      ip: datos.ip,
    });
    return ok(undefined);
  };
}
