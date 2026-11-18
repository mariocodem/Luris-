import type { Logger } from '@/shared/domain/logger';
import { contextoDeCifrado, contextoDeSesion, esperaCodigoDeAcceso } from '../domain/credenciales';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { AlcanceDeConsulta, CuentaDePlataforma, ProveedorDeCuentas } from '../domain/puertos';
import type {
  CifradorDeCredenciales,
  CredencialCifrada,
  Reloj,
  RepositorioDeCredenciales,
} from './puertos';

/**
 * Elige la cuenta con la que se consulta un proceso en una plataforma con ingreso (SIUGJ, §6):
 * la personal del abogado responsable, las de las demás personas asignadas y, por último, la del
 * despacho. Descarta las que la plataforma ya rechazó y las que esperan un código de acceso que
 * nadie ha escrito (ingresar de nuevo enviaría otro código a la persona).
 *
 * El secreto se descifra solo en memoria del worker, durante la consulta.
 */
export function crearProveedorDeCuentas(deps: {
  readonly credenciales: RepositorioDeCredenciales;
  readonly cifrador: CifradorDeCredenciales | null;
  readonly reloj: Reloj;
  /** Minutos que LURIS espera el código de acceso antes de pedir uno nuevo. */
  readonly minutosParaCodigo: number;
  readonly logger: Logger;
}): ProveedorDeCuentas {
  function utilizable(credencial: CredencialCifrada): boolean {
    return !esperaCodigoDeAcceso(
      credencial.codigoSolicitadoEn,
      deps.reloj.ahora(),
      deps.minutosParaCodigo,
    );
  }

  return {
    async cuentaPara(alcance: AlcanceDeConsulta, plataforma: CodigoPlataforma) {
      const { cifrador } = deps;
      if (!cifrador) return null;
      const candidatas = await deps.credenciales.paraProceso(
        alcance.despachoId,
        alcance.procesoId,
        plataforma,
      );
      const credencial = candidatas.find(utilizable) ?? candidatas[0];
      if (!credencial) return null;

      const secreto = cifrador.descifrar(credencial.secreto, contextoDeCifrado(credencial));
      if (!secreto) {
        deps.logger.error('No se pudo descifrar una credencial', {
          despachoId: alcance.despachoId,
          credencialId: credencial.id,
        });
        return null;
      }
      const contexto = contextoDeSesion(credencial.id);
      const sesion = credencial.sesion ? cifrador.descifrar(credencial.sesion, contexto) : null;
      const { despachoId } = alcance;
      const { id } = credencial;

      const cuenta: CuentaDePlataforma = {
        credencialId: id,
        usuario: credencial.usuario,
        secreto,
        sesion,
        esperandoCodigo: !utilizable(credencial),
        async guardarSesion(nueva) {
          await deps.credenciales.guardarSesion(
            despachoId,
            id,
            cifrador.cifrar(nueva, contexto),
            deps.reloj.ahora(),
          );
          await deps.credenciales.marcarCodigoSolicitado(despachoId, id, null);
          await deps.credenciales.registrarVerificacion(
            despachoId,
            id,
            'EXITOSA',
            deps.reloj.ahora(),
          );
        },
        async olvidarSesion() {
          await deps.credenciales.guardarSesion(despachoId, id, null, deps.reloj.ahora());
        },
        async esperarCodigo() {
          await deps.credenciales.marcarCodigoSolicitado(despachoId, id, deps.reloj.ahora());
          await deps.credenciales.registrarVerificacion(
            despachoId,
            id,
            'REQUIERE_INTERVENCION',
            deps.reloj.ahora(),
          );
        },
        async registrarRechazo() {
          await deps.credenciales.guardarSesion(despachoId, id, null, deps.reloj.ahora());
          await deps.credenciales.registrarVerificacion(
            despachoId,
            id,
            'CREDENCIALES_INVALIDAS',
            deps.reloj.ahora(),
          );
        },
      };
      return cuenta;
    },
  };
}
