import { describe, expect, it } from 'vitest';
import {
  type CodigoErrorPlataforma,
  ErrorPlataforma,
  esTransitorio,
  mensajeDeErrorDePlataforma,
} from './errores';
import { CODIGOS_DE_PLATAFORMA, ESTADOS_DE_CONSULTA } from './plataforma';
import { mensajeDeResumen } from './sincronizacion';

const CODIGOS_DE_ERROR = ESTADOS_DE_CONSULTA.filter(
  (e): e is CodigoErrorPlataforma => e !== 'EXITOSA',
);

/** Nada técnico ante la persona usuaria (§10). */
const JERGA = /\b(HTTP|[45]\d\d|fetch|timeout|null|undefined|JSON|error|exception|stack)\b/i;

describe('mensajes de error de plataforma', () => {
  it.each(CODIGOS_DE_PLATAFORMA.flatMap((p) => CODIGOS_DE_ERROR.map((c) => [p, c] as const)))(
    '%s / %s: dice qué pasó, sin jerga técnica',
    (plataforma, codigo) => {
      const mensaje = mensajeDeErrorDePlataforma(plataforma, codigo);
      expect(mensaje).not.toMatch(JERGA);
      expect(mensaje.length).toBeGreaterThan(30);
      expect(mensaje).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
    },
  );

  it('nombra la plataforma dentro de la frase', () => {
    expect(mensajeDeErrorDePlataforma('RAMA_CPNU', 'NO_ENCONTRADO')).toContain('la Rama Judicial');
    expect(mensajeDeErrorDePlataforma('RAMA_CPNU', 'LIMITE_DE_CONSULTAS')).toMatch(
      /^La Rama Judicial/,
    );
  });

  it('solo «no respondió» y «pidió esperar» se reintentan solos', () => {
    expect(CODIGOS_DE_ERROR.filter(esTransitorio)).toEqual([
      'PLATAFORMA_NO_DISPONIBLE',
      'LIMITE_DE_CONSULTAS',
    ]);
  });

  it('ErrorPlataforma separa el mensaje del detalle técnico', () => {
    const error = new ErrorPlataforma(
      'RAMA_CPNU',
      'PLATAFORMA_NO_DISPONIBLE',
      'HTTP 503 en /Proceso',
    );
    expect(error.codigo).toBe('PLATAFORMA_NO_DISPONIBLE');
    expect(error.transitorio).toBe(true);
    expect(error.mensajeUsuario).not.toContain('503');
    expect(error.detalleTecnico).toContain('503');
  });
});

describe('mensajeDeResumen', () => {
  it('distingue la carga inicial de las novedades', () => {
    expect(
      mensajeDeResumen('RAMA_CPNU', {
        tipo: 'SINCRONIZADO',
        nuevas: 73,
        total: 73,
        cargaInicial: true,
        reservado: false,
      }),
    ).toBe('Trajimos 73 actuaciones de la Rama Judicial. Desde ahora te avisaremos de las nuevas.');
    expect(
      mensajeDeResumen('RAMA_CPNU', {
        tipo: 'SINCRONIZADO',
        nuevas: 1,
        total: 74,
        cargaInicial: false,
        reservado: false,
      }),
    ).toBe('Hay una actuación nueva en la Rama Judicial.');
    expect(
      mensajeDeResumen('RAMA_CPNU', {
        tipo: 'SINCRONIZADO',
        nuevas: 3,
        total: 76,
        cargaInicial: false,
        reservado: false,
      }),
    ).toBe('Hay 3 actuaciones nuevas en la Rama Judicial.');
    expect(
      mensajeDeResumen('RAMA_CPNU', {
        tipo: 'SINCRONIZADO',
        nuevas: 0,
        total: 76,
        cargaInicial: false,
        reservado: false,
      }),
    ).toBe('Sin actuaciones nuevas en la Rama Judicial.');
  });

  it('explica los procesos reservados', () => {
    expect(
      mensajeDeResumen('RAMA_CPNU', {
        tipo: 'SINCRONIZADO',
        nuevas: 0,
        total: 0,
        cargaInicial: true,
        reservado: true,
      }),
    ).toContain('reservado');
  });

  it('usa el mensaje del error cuando la consulta falló', () => {
    expect(mensajeDeResumen('RAMA_CPNU', { tipo: 'FALLIDO', codigo: 'NO_ENCONTRADO' })).toBe(
      mensajeDeErrorDePlataforma('RAMA_CPNU', 'NO_ENCONTRADO'),
    );
  });
});
