import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Logger } from '@/shared/domain/logger';
import { ok } from '@/shared/domain/result';
import type { ClienteHttp } from '../http/cliente-http';
import { crearPlataformaSpoaOficial, leerRespuestaSpoa } from './adaptador-spoa-oficial';
import { interpretarTextoSpoa } from './lector-de-texto-spoa';
import { leerFechaSpoa } from './registro-spoa';

/**
 * SPOA (Fase 6) con fixtures sintéticos: datos ficticios con la estructura del portal de la
 * Fiscalía (ver tests/fixtures/spoa/README.md).
 */

const NUNC = '110016000049202300123';
const fixture = (nombre: string) =>
  readFileSync(path.join(process.cwd(), 'tests/fixtures/spoa', nombre), 'utf8');
const TEXTO = fixture('resultado-copiado.txt');
const XML = fixture('respuesta-servicio.xml');

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

describe('lector del texto copiado del SPOA', () => {
  it('lee los datos de la noticia criminal y sus actuaciones con las fechas oficiales', () => {
    const r = interpretarTextoSpoa(TEXTO, NUNC);
    if (!r.ok) throw r.error;
    const [expediente] = r.value.expedientes;
    expect(r.value.plataforma).toBe('SPOA');
    expect(expediente).toMatchObject({
      idExterno: NUNC,
      despachoJudicial: 'FISCALÍA 123 LOCAL',
      departamento: 'BOGOTÁ, D.C., BOGOTÁ, D. C.',
    });
    expect(expediente?.detalles).toEqual([
      { etiqueta: 'Estado', valor: 'ACTIVO' },
      { etiqueta: 'Etapa', valor: 'INDAGACION' },
      {
        etiqueta: 'Delitos',
        valor:
          'ESTAFA ART. 246 C.P. (consumado); FALSEDAD EN DOCUMENTO PRIVADO ART. 289 C.P. (tentativa)',
      },
      { etiqueta: 'Ley', valor: 'LEY 906 DE 2004' },
      { etiqueta: 'Fecha de los hechos', valor: '14/03/2023' },
      { etiqueta: 'Lugar de los hechos', valor: 'BOGOTÁ, D.C., BOGOTÁ, D. C.' },
      { etiqueta: 'Seccional', valor: 'DIRECCIÓN SECCIONAL DE BOGOTÁ' },
      { etiqueta: 'Unidad', valor: 'UNIDAD DE PATRIMONIO ECONÓMICO' },
      { etiqueta: 'Asignado el', valor: '20/03/2023' },
      { etiqueta: 'Dirección', valor: 'CALLE FICTICIA # 00-00' },
      { etiqueta: 'Teléfonos', valor: '6015550000' },
    ]);
    expect(r.value.actuaciones.map((a) => [a.fechaActuacion, a.descripcion])).toEqual([
      ['2023-05-10', 'ASIGNACION'],
      ['2023-04-02', 'RECEPCION DENUNCIA'],
      ['2023-04-02', 'RECEPCION DENUNCIA'],
    ]);
    // El SPOA no informa fecha de registro: no se inventa.
    expect(r.value.actuaciones.every((a) => a.fechaRegistro === null)).toBe(true);
  });

  it('dos actuaciones iguales el mismo día son dos, con identificadores estables', () => {
    const una = interpretarTextoSpoa(TEXTO, NUNC);
    const otra = interpretarTextoSpoa(TEXTO, NUNC);
    if (!una.ok || !otra.ok) throw new Error('debía leer');
    const ids = una.value.actuaciones.map((a) => a.idExterno);
    expect(new Set(ids).size).toBe(3);
    expect(otra.value.actuaciones.map((a) => a.idExterno)).toEqual(ids);
  });

  it('acepta valores en la misma línea, tabuladores y fechas año-mes-día', () => {
    const variante = [
      'Número de la Noticia Criminal: 110016000049202300123',
      'Estado\tACTIVO',
      'Actuaciones del caso - No reservadas',
      'Fecha actuación\tNombre actuación',
      '2023-05-10 08:30:00\tASIGNACION',
      '02/04/2023  RECEPCION DENUNCIA',
      'Fecha de consulta',
    ].join('\r\n');
    const r = interpretarTextoSpoa(variante, NUNC);
    if (!r.ok) throw r.error;
    expect(r.value.expedientes[0]?.detalles).toEqual([{ etiqueta: 'Estado', valor: 'ACTIVO' }]);
    expect(r.value.actuaciones.map((a) => [a.fechaActuacion, a.descripcion])).toEqual([
      ['2023-05-10', 'ASIGNACION'],
      ['2023-04-02', 'RECEPCION DENUNCIA'],
    ]);
  });

  it('rechaza el resultado de otra noticia criminal', () => {
    const r = interpretarTextoSpoa(TEXTO, '110016000049202399999');
    expect(r.ok || r.error.motivo).toBe('OTRO_NUMERO');
    expect(!r.ok && r.error.mensajeUsuario).toContain('110016000049202399999');
  });

  it('explica cómo copiar si el texto no es un resultado del SPOA', () => {
    expect(interpretarTextoSpoa('   \n  ', NUNC)).toMatchObject({
      ok: false,
      error: { motivo: 'VACIO' },
    });
    const r = interpretarTextoSpoa('Hola, esto es otra página', NUNC);
    expect(r.ok || r.error.motivo).toBe('NO_RECONOCIDO');
    expect(!r.ok && r.error.mensajeUsuario).toContain('selecciona todo');
  });

  it('un resultado sin actuaciones públicas se lee igual (cero actuaciones)', () => {
    const sinActuaciones = TEXTO.slice(0, TEXTO.indexOf('Actuaciones del caso'));
    const r = interpretarTextoSpoa(sinActuaciones, NUNC);
    expect(r.ok && r.value.actuaciones).toEqual([]);
  });
});

describe('fechas del SPOA', () => {
  it.each([
    ['10/05/2023', '2023-05-10'],
    ['1/5/2023', '2023-05-01'],
    ['10-05-2023', '2023-05-10'],
    ['2023-05-10', '2023-05-10'],
    ['2023/05/10 08:30:00', '2023-05-10'],
    ['16/11/2026 3:15 p. m.', '2026-11-16'],
  ])('%s → %s', (texto, esperado) => {
    expect(leerFechaSpoa(texto)).toBe(esperado);
  });

  it('rechaza días imposibles y texto', () => {
    expect(leerFechaSpoa('31/02/2023')).toBeNull();
    expect(leerFechaSpoa('ayer')).toBeNull();
    expect(leerFechaSpoa(null)).toBeNull();
  });
});

describe('adaptador automático del SPOA (servicio oficial, inactivo por defecto)', () => {
  it('lee el contrato RespuestaConsulta igual que el texto del portal', () => {
    const desdeXml = leerRespuestaSpoa(XML);
    if (!desdeXml.ok || !desdeXml.value) throw new Error('debía leer el XML');
    expect(desdeXml.value.actuaciones).toHaveLength(3);
    expect(desdeXml.value.delitos).toEqual([
      { delito: 'ESTAFA ART. 246 C.P.', grado: 'CONSUMADO' },
      { delito: 'FALSEDAD EN DOCUMENTO PRIVADO ART. 289 C.P.', grado: 'TENTATIVA' },
    ]);
    expect(desdeXml.value.correo).toBeNull(); // «Ninguno»
  });

  it('acepta la respuesta envuelta en un elemento return de SOAP', () => {
    const escapado = XML.replace(/^<\?xml[^>]*>\s*/, '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const soap = `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:consultaResponse xmlns:ns2="urn:spoa"><return>${escapado}</return></ns2:consultaResponse></S:Body></S:Envelope>`;
    const r = leerRespuestaSpoa(soap);
    expect(r.ok && r.value?.noticia).toBe(NUNC);
  });

  function servicio(estado: number, texto: string) {
    const pedidas: string[] = [];
    const http: ClienteHttp = {
      obtenerTexto: async (url) => {
        pedidas.push(url);
        return ok({ estado, texto });
      },
      obtenerJson: () => Promise.reject(new Error('no se usa')),
      enviarJson: () => Promise.reject(new Error('no se usa')),
      obtenerBinario: () => Promise.reject(new Error('no se usa')),
      pausar() {},
    };
    const plataforma = crearPlataformaSpoaOficial({
      urlServicio: 'https://interoperabilidad.fiscalia.test/spoa/',
      http,
      logger: silencioso,
    });
    return { plataforma, pedidas };
  }

  it('cumple el mismo contrato que los demás adaptadores', async () => {
    const { plataforma, pedidas } = servicio(200, XML);
    expect(plataforma).toMatchObject({ codigo: 'SPOA', identificador: 'NUNC' });
    const r = await plataforma.consultar(NUNC, {});
    if (!r.ok) throw r.error;
    expect(pedidas).toEqual([`https://interoperabilidad.fiscalia.test/spoa/${NUNC}`]);
    // Mismo resultado que la consulta asistida con los mismos datos.
    const asistida = interpretarTextoSpoa(TEXTO, NUNC);
    expect(asistida.ok && asistida.value.actuaciones).toEqual(r.value.actuaciones);
  });

  it.each([
    [401, 'CREDENCIALES_INVALIDAS'],
    [403, 'CREDENCIALES_INVALIDAS'],
    [404, 'NO_ENCONTRADO'],
    [500, 'RESPUESTA_INESPERADA'],
  ])('HTTP %i → %s', async (estado, codigo) => {
    const r = await servicio(estado, '').plataforma.consultar(NUNC, {});
    expect(r.ok || r.error.codigo).toBe(codigo);
  });

  it('una respuesta sin registro es NO_ENCONTRADO; un XML ajeno, RESPUESTA_INESPERADA', async () => {
    const sinRegistro = await servicio(
      200,
      '<RespuestaConsulta><DatosRespuesta/></RespuestaConsulta>',
    ).plataforma.consultar(NUNC, {});
    expect(sinRegistro.ok || sinRegistro.error.codigo).toBe('NO_ENCONTRADO');
    const ajeno = await servicio(200, '<html>mantenimiento</html>').plataforma.consultar(NUNC, {});
    expect(ajeno.ok || ajeno.error.codigo).toBe('RESPUESTA_INESPERADA');
  });
});
