import { createHash, randomBytes } from 'node:crypto';
import type { GeneradorDeTokens, LimitadorDeIntentos, Reloj } from '../application/puertos';

export const relojDelSistema: Reloj = { ahora: () => new Date() };

/** Tokens de 256 bits en base64url; en la base solo se guarda su SHA-256 en hexadecimal. */
export const generadorDeTokens: GeneradorDeTokens = {
  generar: () => randomBytes(32).toString('base64url'),
  hash: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),
};

/**
 * Limitador de intentos en memoria, por clave (correo, IP…), con ventana fija.
 * Suficiente para un solo contenedor de aplicación (§12). Si algún día hay varias réplicas,
 * se reemplaza por una implementación en PostgreSQL detrás del mismo puerto.
 */
/** Claves distintas que se recuerdan a la vez antes de limpiar las vencidas. */
const MAXIMO_DE_CLAVES = 10_000;

export function crearLimitadorEnMemoria(opciones: {
  readonly maximoDeFallos: number;
  readonly ventanaMinutos: number;
  readonly reloj?: Reloj;
}): LimitadorDeIntentos {
  const reloj = opciones.reloj ?? relojDelSistema;
  const ventanaMs = opciones.ventanaMinutos * 60_000;
  const registros = new Map<string, { fallos: number; desde: number }>();

  function vigente(clave: string) {
    const registro = registros.get(clave);
    if (!registro) return undefined;
    if (reloj.ahora().getTime() - registro.desde >= ventanaMs) {
      registros.delete(clave);
      return undefined;
    }
    return registro;
  }

  return {
    minutosDeBloqueo(clave) {
      const registro = vigente(clave);
      if (!registro || registro.fallos < opciones.maximoDeFallos) return 0;
      const restanteMs = registro.desde + ventanaMs - reloj.ahora().getTime();
      return Math.max(1, Math.ceil(restanteMs / 60_000));
    },
    registrarFallo(clave) {
      // Sin esto, quien pruebe muchas claves distintas llenaría la memoria.
      if (registros.size >= MAXIMO_DE_CLAVES) {
        for (const otra of [...registros.keys()]) vigente(otra);
      }
      const registro = vigente(clave);
      if (registro) registro.fallos += 1;
      else registros.set(clave, { fallos: 1, desde: reloj.ahora().getTime() });
    },
    limpiar(clave) {
      registros.delete(clave);
    },
  };
}
