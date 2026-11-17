import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de secretos de credenciales de plataformas (§4: AES-256-GCM, clave en variable de
 * entorno). Formato: IV (12 bytes) + etiqueta de autenticación (16) + texto cifrado.
 *
 * El `contexto` (p. ej. «despacho|plataforma|titular|usuario») va como dato autenticado
 * adicional: un secreto cifrado para una fila no se descifra si se copia a otra.
 * La versión permite rotar la clave: se guarda con cada secreto.
 */
export interface SecretoCifrado {
  readonly datos: Uint8Array;
  readonly version: number;
}

export interface CifradorAesGcm {
  cifrar(texto: string, contexto: string): SecretoCifrado;
  /** null si la clave no corresponde, el contexto cambió o los datos se alteraron. */
  descifrar(secreto: SecretoCifrado, contexto: string): string | null;
}

const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;

/** Lee una clave de 32 bytes en base64 (p. ej. `openssl rand -base64 32`). */
export function leerClave(base64: string): Buffer | null {
  const clave = Buffer.from(base64, 'base64');
  return clave.length === 32 ? clave : null;
}

export function crearCifradorAesGcm(opciones: {
  /** Claves por versión; la actual cifra, todas descifran. */
  readonly claves: ReadonlyMap<number, Buffer>;
  readonly versionActual: number;
}): CifradorAesGcm {
  const actual = opciones.claves.get(opciones.versionActual);
  if (actual?.length !== 32) throw new Error('Falta la clave actual de 32 bytes del cifrador');

  return {
    cifrar(texto, contexto) {
      const iv = randomBytes(LARGO_IV);
      const cifrador = createCipheriv('aes-256-gcm', actual, iv);
      cifrador.setAAD(Buffer.from(contexto, 'utf8'));
      const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
      return {
        datos: new Uint8Array(Buffer.concat([iv, cifrador.getAuthTag(), cifrado])),
        version: opciones.versionActual,
      };
    },

    descifrar(secreto, contexto) {
      const clave = opciones.claves.get(secreto.version);
      const datos = Buffer.from(secreto.datos);
      if (!clave || datos.length <= LARGO_IV + LARGO_ETIQUETA) return null;
      try {
        const descifrador = createDecipheriv('aes-256-gcm', clave, datos.subarray(0, LARGO_IV));
        descifrador.setAAD(Buffer.from(contexto, 'utf8'));
        descifrador.setAuthTag(datos.subarray(LARGO_IV, LARGO_IV + LARGO_ETIQUETA));
        return Buffer.concat([
          descifrador.update(datos.subarray(LARGO_IV + LARGO_ETIQUETA)),
          descifrador.final(),
        ]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}
