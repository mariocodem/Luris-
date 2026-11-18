import { describe, expect, it } from 'vitest';
import { crearLoggerPino } from './logger';

function registrar(accion: (logger: ReturnType<typeof crearLoggerPino>) => void): string {
  const lineas: string[] = [];
  const logger = crearLoggerPino({
    nivel: 'debug',
    formato: 'json',
    servicio: 'cli',
    destino: { write: (linea) => lineas.push(linea) },
  });
  accion(logger);
  return lineas.join('');
}

describe('logger: nunca registra secretos', () => {
  it.each([
    'password',
    'contrasena',
    'clave',
    'secreto',
    'token',
    'accessToken',
    'authorization',
    'cookie',
    'credenciales',
    'sesion',
    'codigoDeAcceso',
    'qr',
    'datosCifrados',
    'secretoCifrado',
    'numeroWhatsapp',
  ])('oculta «%s», en el primer nivel y un nivel abajo', (clave) => {
    const salida = registrar((logger) => {
      logger.info('Algo pasó', {
        [clave]: 'VALOR-SECRETO-1',
        anidado: { [clave]: 'VALOR-SECRETO-2' },
      });
    });
    expect(salida).not.toContain('VALOR-SECRETO');
    expect(salida).toContain('[oculto]');
  });

  it('conserva lo que no es sensible, incluidos los códigos de error', () => {
    const salida = registrar((logger) => {
      logger.warn('Consulta sin éxito', { codigo: 'NO_ENCONTRADO', plataforma: 'RAMA_CPNU' });
    });
    expect(salida).toContain('NO_ENCONTRADO');
    expect(salida).toContain('RAMA_CPNU');
  });

  it('el logger hijo hereda la protección', () => {
    const salida = registrar((logger) => {
      logger.child({ modulo: 'x' }).error('Falló', { token: 'VALOR-SECRETO' });
    });
    expect(salida).not.toContain('VALOR-SECRETO');
  });
});
