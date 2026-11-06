import { describe, expect, it } from 'vitest';
import {
  aAppError,
  AppError,
  ErrorDeValidacion,
  ErrorInesperado,
  ErrorNoEncontrado,
  ErrorSinPermiso,
  esAppError,
} from './app-error';
import { LONGITUD_CODIGO_DE_AYUDA } from './codigo-de-ayuda';

describe('AppError', () => {
  it('separa el mensaje para el usuario del detalle técnico', () => {
    const error = new AppError({
      codigo: 'PLATAFORMA_NO_DISPONIBLE',
      mensajeUsuario: 'La plataforma SAMAI no está respondiendo ahora.',
      detalleTecnico: 'ETIMEDOUT tras 30000 ms',
    });

    expect(error.codigo).toBe('PLATAFORMA_NO_DISPONIBLE');
    expect(error.mensajeUsuario).toBe('La plataforma SAMAI no está respondiendo ahora.');
    expect(error.message).toBe('ETIMEDOUT tras 30000 ms');
    expect(error.name).toBe('AppError');
    expect(error.codigoDeAyuda).toHaveLength(LONGITUD_CODIGO_DE_AYUDA);
  });

  it('las subclases conservan su nombre y son AppError', () => {
    const errores = [
      new ErrorNoEncontrado('No encontramos ese proceso.'),
      new ErrorSinPermiso(),
      new ErrorDeValidacion({ radicado: ['El radicado debe tener 23 números; este tiene 21.'] }),
      new ErrorInesperado(new Error('boom')),
    ];

    expect(errores.map((e) => e.name)).toEqual([
      'ErrorNoEncontrado',
      'ErrorSinPermiso',
      'ErrorDeValidacion',
      'ErrorInesperado',
    ]);
    expect(errores.every(esAppError)).toBe(true);
  });

  it('ErrorDeValidacion expone los mensajes por campo', () => {
    const error = new ErrorDeValidacion({ radicado: ['Debe tener 23 números.'] });
    expect(error.erroresPorCampo.radicado).toEqual(['Debe tener 23 números.']);
    expect(error.mensajeUsuario).toMatch(/revisa los campos/i);
  });

  describe('aAppError', () => {
    it('conserva los AppError tal cual', () => {
      const original = new ErrorNoEncontrado('No encontramos ese proceso.');
      expect(aAppError(original)).toBe(original);
    });

    it('envuelve cualquier otro valor sin exponer el mensaje técnico', () => {
      const tecnico = new TypeError('fetch failed');
      const error = aAppError(tecnico);

      expect(error).toBeInstanceOf(ErrorInesperado);
      expect(error.mensajeUsuario).not.toContain('fetch failed');
      expect(error.detalleTecnico).toBe('fetch failed');
      expect(error.cause).toBe(tecnico);
    });

    it.each([['texto'], [404], [null], [undefined], [{ status: 500 }]])(
      'el mensaje para el usuario nunca contiene códigos ni jerga técnica (%j)',
      (valor) => {
        const { mensajeUsuario } = aAppError(valor);
        expect(mensajeUsuario).not.toMatch(/\b(404|500|error|exception|stack|undefined|null)\b/i);
      },
    );
  });
});
