import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { alcanceDe } from '@/modules/usuarios/domain/permisos';
import { type AppError, ErrorDeValidacion, ErrorNoEncontrado } from '@/shared/domain/app-error';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import { contextoDeCodigo, contextoDeSesion, esperaCodigoDeAcceso } from '../domain/credenciales';
import type { ErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { CompletadorDeIngreso, ContextoConsulta } from '../domain/puertos';
import { ErrorCifradoNoConfigurado } from './credenciales';
import type {
  CifradorDeCredenciales,
  ColaDeTrabajos,
  Reloj,
  RepositorioDeCredenciales,
  RepositorioDeSincronizacion,
  SolicitudDeSincronizacion,
} from './puertos';
import { identificadorPara, type PlataformaAutomatica } from './solicitar-consulta';

/**
 * Código de acceso (segundo factor) de las plataformas que lo piden al ingresar (SIUGJ, §6).
 * La plataforma lo envía a la persona; ella lo escribe en LURIS y LURIS lo entrega a la
 * plataforma para terminar de ingresar. LURIS nunca lee el correo ni evade el factor.
 */

/** Códigos de acceso: entre 4 y 12 letras o cifras (sin espacios). */
const FORMATO_DE_CODIGO = /^[A-Za-z0-9]{4,12}$/;

export function leerCodigoDeAcceso(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, '');
  return FORMATO_DE_CODIGO.test(limpio) ? limpio : null;
}

export interface DependenciasDeCodigo {
  readonly credenciales: RepositorioDeCredenciales;
  readonly cifrador: CifradorDeCredenciales | null;
  readonly cola: ColaDeTrabajos;
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: Reloj;
  readonly minutosParaCodigo: number;
}

/** La persona escribe en Ajustes → Plataformas el código que le envió la plataforma. */
export function crearIngresarCodigoDeAcceso(deps: DependenciasDeCodigo) {
  return async function ingresarCodigoDeAcceso(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly credencialId: string;
      readonly codigo: string;
      readonly ip: string | null;
    },
  ): Promise<Result<void, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CREDENCIALES_GESTIONAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;

    const credencial = await deps.credenciales.buscar(actor.despacho.id, solicitud.credencialId);
    const esSuya =
      credencial?.alcance === 'PERSONAL' && credencial.membresiaId === actor.membresiaId;
    const esDelDespacho =
      credencial?.alcance === 'DESPACHO' &&
      alcanceDe(actor.perfil, 'CREDENCIALES_GESTIONAR') === 'TODOS';
    if (!credencial || (!esSuya && !esDelDespacho)) {
      return err(
        new ErrorNoEncontrado(
          'No encontramos esa credencial. Recarga la página.',
          `Credencial ${solicitud.credencialId}`,
        ),
      );
    }
    if (
      !esperaCodigoDeAcceso(
        credencial.codigoSolicitadoEn,
        deps.reloj.ahora(),
        deps.minutosParaCodigo,
      )
    ) {
      return err(
        new ErrorDeValidacion(
          {},
          'La plataforma ya no está esperando un código. Si te llegó uno nuevo, LURIS te lo pedirá en la próxima consulta.',
        ),
      );
    }
    const codigo = leerCodigoDeAcceso(solicitud.codigo);
    if (!codigo) {
      return err(
        new ErrorDeValidacion(
          { codigo: ['Escribe el código tal como te llegó: entre 4 y 12 letras o números.'] },
          'Revisa el código de acceso.',
        ),
      );
    }
    if (!deps.cifrador) return err(new ErrorCifradoNoConfigurado());

    await deps.cola.encolarCodigoDeAcceso({
      despachoId: actor.despacho.id,
      credencialId: credencial.id,
      codigo: deps.cifrador.cifrar(codigo, contextoDeCodigo(credencial.id)),
    });
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'CODIGO_DE_ACCESO_INGRESADO',
      entidad: 'CredencialPlataforma',
      entidadId: credencial.id,
      datos: { plataforma: credencial.plataforma },
      ip: solicitud.ip,
    });
    return ok(undefined);
  };
}

export type ResultadoDelCodigo = 'INGRESO_COMPLETADO' | 'CODIGO_INVALIDO' | 'INGRESO_VENCIDO';

/**
 * Termina el ingreso con el código (lo ejecuta el worker). Si entra, guarda la sesión cifrada y
 * vuelve a encolar la consulta de los procesos del despacho en esa plataforma. Un código
 * equivocado deja la credencial esperando otro; un ingreso vencido la libera para que la próxima
 * consulta pida un código nuevo.
 */
export function crearCompletarIngreso(deps: {
  readonly credenciales: RepositorioDeCredenciales;
  readonly cifrador: CifradorDeCredenciales | null;
  readonly completadores: ReadonlyMap<CodigoPlataforma, CompletadorDeIngreso>;
  readonly sincronizacion: RepositorioDeSincronizacion;
  readonly automaticas: readonly PlataformaAutomatica[];
  readonly cola: ColaDeTrabajos;
  readonly reloj: Reloj;
  readonly logger: Logger;
}) {
  return async function completarIngreso(
    solicitud: {
      readonly despachoId: string;
      readonly credencialId: string;
      readonly codigo: { readonly datos: Uint8Array; readonly version: number };
    },
    ctx: ContextoConsulta,
  ): Promise<Result<ResultadoDelCodigo | null, ErrorPlataforma>> {
    const { despachoId, credencialId } = solicitud;
    const credencial = await deps.credenciales.buscar(despachoId, credencialId);
    const completador = credencial ? deps.completadores.get(credencial.plataforma) : undefined;
    if (!credencial || !completador || !deps.cifrador) return ok(null);

    const codigo = deps.cifrador.descifrar(solicitud.codigo, contextoDeCodigo(credencialId));
    if (!codigo) {
      deps.logger.error('No se pudo descifrar un código de acceso', { despachoId, credencialId });
      return ok(null);
    }

    const resultado = await completador.completar(credencialId, codigo, ctx);
    const ahora = deps.reloj.ahora();
    if (!resultado.ok) {
      if (resultado.error === 'CODIGO_INVALIDO') return ok('CODIGO_INVALIDO');
      if (resultado.error === 'INGRESO_VENCIDO') {
        await deps.credenciales.marcarCodigoSolicitado(despachoId, credencialId, null);
        return ok('INGRESO_VENCIDO');
      }
      // Reintentar con el mismo código no sirve (vence pronto): queda esperando uno nuevo.
      await deps.credenciales.marcarCodigoSolicitado(despachoId, credencialId, null);
      await deps.credenciales.registrarVerificacion(
        despachoId,
        credencialId,
        resultado.error.codigo,
        ahora,
      );
      return ok('INGRESO_VENCIDO');
    }

    await deps.credenciales.guardarSesion(
      despachoId,
      credencialId,
      deps.cifrador.cifrar(resultado.value.sesion, contextoDeSesion(credencialId)),
      ahora,
    );
    await deps.credenciales.marcarCodigoSolicitado(despachoId, credencialId, null);
    await deps.credenciales.registrarVerificacion(despachoId, credencialId, 'EXITOSA', ahora);

    // Reanuda las consultas de la plataforma que esperaban el ingreso.
    const plataforma = deps.automaticas.find((p) => p.codigo === credencial.plataforma);
    if (plataforma) {
      const solicitudes: SolicitudDeSincronizacion[] = (
        await deps.sincronizacion.procesosActivos(despachoId)
      )
        .filter((proceso) => identificadorPara(plataforma, proceso) !== null)
        .map((proceso) => ({ despachoId, procesoId: proceso.id, plataforma: plataforma.codigo }));
      if (solicitudes.length > 0) await deps.cola.encolarSincronizaciones(solicitudes);
    }
    deps.logger.info('Ingreso completado con código de acceso', {
      despachoId,
      credencialId,
      plataforma: credencial.plataforma,
    });
    return ok('INGRESO_COMPLETADO');
  };
}
