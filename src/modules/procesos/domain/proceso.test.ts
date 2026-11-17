import { describe, expect, it } from 'vitest';
import { esquemaDatosDeProceso } from './esquemas';
import {
  claveDeEtiqueta,
  nombreDeProceso,
  normalizarParaBusqueda,
  problemasDeEtiquetas,
  separarEtiquetas,
  textoDeBusqueda,
  unificarEtiquetas,
} from './proceso';

describe('etiquetas', () => {
  it('compara sin distinguir mayúsculas, tildes ni espacios', () => {
    expect(claveDeEtiqueta('  Tutela   Urgente ')).toBe(claveDeEtiqueta('tutela urgente'));
    expect(claveDeEtiqueta('Bogotá')).toBe(claveDeEtiqueta('BOGOTA'));
  });

  it('quita repetidas y vacías, y conserva la primera forma escrita', () => {
    expect(unificarEtiquetas(['Civil', ' civil ', '', 'URGENTE', 'Urgente'])).toEqual([
      'Civil',
      'URGENTE',
    ]);
  });

  it('separa por coma, punto y coma o barra', () => {
    expect(separarEtiquetas('Civil, Urgente; Bogotá | civil')).toEqual([
      'Civil',
      'Urgente',
      'Bogotá',
    ]);
  });

  it('avisa si una etiqueta es muy larga o si hay demasiadas', () => {
    expect(problemasDeEtiquetas(['x'.repeat(51)])[0]).toMatch(/máximo 50 caracteres/);
    expect(problemasDeEtiquetas(Array.from({ length: 11 }, (_, i) => `E${i}`))[0]).toMatch(
      /máximo 10 etiquetas; tiene 11/,
    );
    expect(problemasDeEtiquetas(['Civil'])).toEqual([]);
  });
});

describe('búsqueda', () => {
  it('normaliza tildes, eñes, mayúsculas y espacios igual que la migración', () => {
    expect(normalizarParaBusqueda('  Pérez   GARCÍA Muñoz ')).toBe('perez garcia munoz');
    expect(textoDeBusqueda({ alias: 'Nulidad', cliente: 'María Fernanda Ruiz' })).toBe(
      'nulidad maria fernanda ruiz',
    );
    expect(textoDeBusqueda({ alias: null, cliente: null })).toBe('');
  });
});

describe('nombreDeProceso', () => {
  it('usa el alias; si no hay, el identificador', () => {
    expect(nombreDeProceso({ alias: 'Ejecutivo', radicado: '1', nunc: null })).toBe('Ejecutivo');
    expect(nombreDeProceso({ alias: null, radicado: '11001', nunc: null })).toBe('Radicado 11001');
    expect(nombreDeProceso({ alias: null, radicado: null, nunc: '22' })).toBe('NUNC 22');
  });
});

describe('esquemaDatosDeProceso', () => {
  it('normaliza el radicado, el NUNC, los textos y las etiquetas', () => {
    expect(
      esquemaDatosDeProceso.parse({
        radicado: '11001-31-03-001-2023-00123-00',
        nunc: '11001 60 00049 2023 00123',
        alias: '  Restitución   de inmueble ',
        cliente: '',
        etiquetas: ['Civil', 'civil', ' Urgente '],
      }),
    ).toEqual({
      radicado: '11001310300120230012300',
      nunc: '110016000049202300123',
      alias: 'Restitución de inmueble',
      cliente: null,
      etiquetas: ['Civil', 'Urgente'],
    });
  });

  it('acepta solo NUNC o solo radicado', () => {
    expect(esquemaDatosDeProceso.parse({ nunc: '110016000049202300123' }).radicado).toBeNull();
    expect(esquemaDatosDeProceso.parse({ radicado: '11001310300120230012300' }).nunc).toBeNull();
  });

  it('exige al menos un identificador, con el error en el campo del radicado', () => {
    const resultado = esquemaDatosDeProceso.safeParse({ alias: 'Sin número' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues).toEqual([
      expect.objectContaining({
        path: ['radicado'],
        message: 'Escribe el radicado (23 números) o el NUNC (21 números) del proceso.',
      }),
    ]);
  });

  it('muestra el error del radicado junto al campo y no repite el de "falta identificador"', () => {
    const resultado = esquemaDatosDeProceso.safeParse({ radicado: '11001-31-03' });
    expect(resultado.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['radicado', 'El radicado debe tener 23 números; este tiene 9.'],
    ]);
  });

  it('limita la longitud del alias y del cliente', () => {
    const resultado = esquemaDatosDeProceso.safeParse({
      radicado: '11001310300120230012300',
      alias: 'a'.repeat(201),
      cliente: 'c'.repeat(301),
    });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      'El alias puede tener máximo 200 caracteres.',
      'El cliente puede tener máximo 300 caracteres.',
    ]);
  });
});
