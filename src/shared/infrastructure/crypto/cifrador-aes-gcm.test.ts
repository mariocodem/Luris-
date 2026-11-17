import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { crearCifradorAesGcm, leerClave } from './cifrador-aes-gcm';

const CLAVE = randomBytes(32);
const cifrador = crearCifradorAesGcm({ claves: new Map([[1, CLAVE]]), versionActual: 1 });
const CONTEXTO = 'luris-credencial-v1|despacho|SAMAI|membresia|abogada';

describe('cifrador AES-256-GCM de credenciales', () => {
  it('cifra y descifra; el texto cifrado no contiene el secreto', () => {
    const secreto = cifrador.cifrar('contraseña-ñ-123', CONTEXTO);
    expect(secreto.version).toBe(1);
    expect(Buffer.from(secreto.datos).toString('utf8')).not.toContain('contraseña');
    expect(cifrador.descifrar(secreto, CONTEXTO)).toBe('contraseña-ñ-123');
  });

  it('cada cifrado es distinto aunque el secreto sea el mismo (IV aleatorio)', () => {
    const a = cifrador.cifrar('igual', CONTEXTO);
    const b = cifrador.cifrar('igual', CONTEXTO);
    expect(Buffer.from(a.datos).equals(Buffer.from(b.datos))).toBe(false);
  });

  it('no descifra en otro contexto (otro despacho, plataforma o titular)', () => {
    const secreto = cifrador.cifrar('x', CONTEXTO);
    expect(cifrador.descifrar(secreto, CONTEXTO.replace('despacho', 'otro'))).toBeNull();
  });

  it('detecta datos alterados y claves equivocadas', () => {
    const secreto = cifrador.cifrar('x', CONTEXTO);
    const alterado = new Uint8Array(secreto.datos);
    alterado[alterado.length - 1] = (alterado[alterado.length - 1] ?? 0) ^ 1;
    expect(cifrador.descifrar({ ...secreto, datos: alterado }, CONTEXTO)).toBeNull();

    const otro = crearCifradorAesGcm({ claves: new Map([[1, randomBytes(32)]]), versionActual: 1 });
    expect(otro.descifrar(secreto, CONTEXTO)).toBeNull();
    expect(cifrador.descifrar({ ...secreto, version: 2 }, CONTEXTO)).toBeNull();
  });

  it('permite rotar la clave: la nueva cifra y la anterior sigue descifrando', () => {
    const viejo = cifrador.cifrar('antes', CONTEXTO);
    const rotado = crearCifradorAesGcm({
      claves: new Map([
        [1, CLAVE],
        [2, randomBytes(32)],
      ]),
      versionActual: 2,
    });
    expect(rotado.descifrar(viejo, CONTEXTO)).toBe('antes');
    expect(rotado.cifrar('después', CONTEXTO).version).toBe(2);
  });

  it('exige una clave de 32 bytes', () => {
    expect(leerClave(randomBytes(32).toString('base64'))).not.toBeNull();
    expect(leerClave(randomBytes(16).toString('base64'))).toBeNull();
    expect(() => crearCifradorAesGcm({ claves: new Map(), versionActual: 1 })).toThrow();
  });
});
