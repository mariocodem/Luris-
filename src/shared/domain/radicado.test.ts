import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorIdentificadorInvalido } from './identificador-judicial';
import { crearRadicado, esquemaRadicado, esRadicado, LONGITUD_RADICADO } from './radicado';

const VALIDO = '11001310300120230012300';
const CON_CERO_INICIAL = '05001310300120230012300'; // Medellín: código DANE 05001

/** Convierte dígitos ASCII a dígitos de ancho completo (U+FF10–U+FF19). */
function aAnchoCompleto(digitos: string): string {
  return digitos.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));
}

function valorDe(texto: string): string {
  const resultado = crearRadicado(texto);
  if (!resultado.ok) throw new Error(`Se esperaba válido: ${resultado.error.mensajeUsuario}`);
  return resultado.value;
}

function errorDe(texto: string): ErrorIdentificadorInvalido {
  const resultado = crearRadicado(texto);
  if (resultado.ok) throw new Error(`Se esperaba inválido: ${texto}`);
  return resultado.error;
}

describe('Radicado', () => {
  it('tiene 23 dígitos', () => {
    expect(LONGITUD_RADICADO).toBe(23);
  });

  describe('normalización', () => {
    it.each([
      ['solo dígitos', VALIDO],
      ['con guiones', '11001-31-03-001-2023-00123-00'],
      ['con espacios', '11001 31 03 001 2023 00123 00'],
      ['con puntos', '11001.31.03.001.2023.00123.00'],
      ['con barras', '11001/31/03/001/2023/00123/00'],
      ['con espacios al inicio y al final', '   11001310300120230012300   '],
      ['con tabuladores y saltos de línea', '11001\t31\n03\r\n001 2023 00123 00'],
      ['con espacio no separable', '11001 31 03 001 2023 00123 00'],
      ['con separadores mezclados', ' 11001-31.03 001/2023_00123–00 '],
      ['con dígitos de ancho completo', aAnchoCompleto(VALIDO)],
    ])('acepta un radicado %s y lo deja en 23 dígitos', (_caso, texto) => {
      expect(valorDe(texto)).toBe(VALIDO);
    });

    it('conserva los ceros a la izquierda', () => {
      expect(valorDe('05001-31-03-001-2023-00123-00')).toBe(CON_CERO_INICIAL);
      expect(valorDe(CON_CERO_INICIAL).startsWith('0')).toBe(true);
    });

    it('acepta un radicado formado solo por ceros (la validación es de formato)', () => {
      expect(valorDe('0'.repeat(23))).toBe('0'.repeat(23));
    });

    it('el valor es siempre texto, nunca número', () => {
      const radicado = valorDe(CON_CERO_INICIAL);
      expect(typeof radicado).toBe('string');
      expect(JSON.parse(JSON.stringify({ radicado }))).toEqual({ radicado: CON_CERO_INICIAL });
    });

    it('el resultado nunca contiene guiones ni espacios', () => {
      expect(valorDe('11001 - 31 - 03 - 001 - 2023 - 00123 - 00')).toMatch(/^\d{23}$/);
    });

    it('es idempotente', () => {
      expect(valorDe(valorDe('11001-31-03-001-2023-00123-00'))).toBe(VALIDO);
    });
  });

  describe('longitud incorrecta', () => {
    it.each([
      [22, '1100131030012023001230'],
      [24, '110013103001202300123000'],
      [1, '7'],
      [30, '1'.repeat(30)],
    ])('rechaza %i dígitos con un mensaje que dice cuántos tiene', (cantidad, texto) => {
      const error = errorDe(texto);
      expect(error).toBeInstanceOf(ErrorIdentificadorInvalido);
      expect(error.codigo).toBe('RADICADO_INVALIDO');
      expect(error.motivo).toBe('LONGITUD_INCORRECTA');
      expect(error.digitosEncontrados).toBe(cantidad);
      expect(error.mensajeUsuario).toBe(
        `El radicado debe tener 23 números; este tiene ${cantidad}.`,
      );
    });

    it('cuenta solo los dígitos al informar la longitud', () => {
      expect(errorDe('11001-31-03-001-2023-00123-0').digitosEncontrados).toBe(22);
    });

    it('con 21 dígitos sugiere que podría ser un NUNC', () => {
      const error = errorDe('110016000049202300123');
      expect(error.mensajeUsuario).toBe(
        'El radicado debe tener 23 números; este tiene 21. Si es un NUNC de la Fiscalía (21 números), regístralo en el campo NUNC.',
      );
    });

    it('descarta letras: un texto con letras y 23 dígitos queda válido', () => {
      expect(valorDe('Rad. 11001-31-03-001-2023-00123-00')).toBe(VALIDO);
    });

    it('una letra en lugar de un dígito deja el radicado incompleto', () => {
      // Dos "O" (letra) en lugar de "0" (cero): se descartan y quedan 21 dígitos.
      expect(errorDe('11001-31-03-OO1-2023-00123-00').digitosEncontrados).toBe(21);
    });
  });

  describe('vacío', () => {
    it.each([[''], ['   '], ['---'], ['radicado'], ['\n\t']])(
      'rechaza %j pidiendo escribir el radicado',
      (texto) => {
        const error = errorDe(texto);
        expect(error.motivo).toBe('VACIO');
        expect(error.digitosEncontrados).toBe(0);
        expect(error.mensajeUsuario).toBe('Escribe el radicado: son 23 números.');
      },
    );
  });

  describe('esRadicado', () => {
    it('reconoce solo cadenas ya normalizadas de 23 dígitos', () => {
      expect(esRadicado(VALIDO)).toBe(true);
      expect(esRadicado(CON_CERO_INICIAL)).toBe(true);
      expect(esRadicado('11001-31-03-001-2023-00123-00')).toBe(false);
      expect(esRadicado('1100131030012023001230')).toBe(false);
      expect(esRadicado(`${VALIDO}\n`)).toBe(false);
      expect(esRadicado('')).toBe(false);
    });
  });

  describe('esquemaRadicado (Zod)', () => {
    it('normaliza al validar', () => {
      expect(esquemaRadicado.parse('11001-31-03-001-2023-00123-00')).toBe(VALIDO);
    });

    it('entrega el mensaje en español claro', () => {
      const resultado = esquemaRadicado.safeParse('11001-31-03-001');
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.message).toBe(
        'El radicado debe tener 23 números; este tiene 12.',
      );
    });

    it.each([[undefined], [null], [11001310300120230012300], [{}]])(
      'rechaza valores que no son texto (%j) sin jerga técnica',
      (valor) => {
        const resultado = esquemaRadicado.safeParse(valor);
        expect(resultado.success).toBe(false);
        expect(resultado.error?.issues[0]?.message).toBe('Escribe el radicado: son 23 números.');
      },
    );

    it('funciona dentro de un objeto y señala el campo con error', () => {
      const esquema = z.object({ radicado: esquemaRadicado });
      const resultado = esquema.safeParse({ radicado: '123' });
      expect(resultado.error?.issues).toHaveLength(1);
      expect(resultado.error?.issues[0]?.path).toEqual(['radicado']);
      expect(esquema.parse({ radicado: '11001 31 03 001 2023 00123 00' })).toEqual({
        radicado: VALIDO,
      });
    });
  });
});
