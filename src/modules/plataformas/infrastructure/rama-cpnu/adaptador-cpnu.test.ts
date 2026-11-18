import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { ClienteHttp, FalloHttp, RespuestaJson } from '../http/cliente-http';
import { crearPlataformaCpnu, leerSujetos } from './adaptador-cpnu';
import { crearDescargadorCpnu } from './descargador-cpnu';

/**
 * Adaptador de la CPNU contra respuestas grabadas de la API real (tests/fixtures/cpnu, con los
 * nombres de personas naturales cambiados por ficticios).
 */

const BASE = 'https://cpnu.test/api/v2';
const TUTELA = '11001310300120190012300';
const EJECUTIVO = '50001400300120210034300';

function fixture(nombre: string): unknown {
  const ruta = path.join(process.cwd(), 'tests/fixtures/cpnu', `${nombre}.json`);
  return JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
}

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

type Respuesta = RespuestaJson | FalloHttp;

function busqueda(radicado: string) {
  return `${BASE}/Procesos/Consulta/NumeroRadicacion?numero=${radicado}&SoloActivos=false&pagina=1`;
}

const RUTAS_REALES: Record<string, Respuesta> = {
  [busqueda(TUTELA)]: { estado: 200, cuerpo: fixture('busqueda-tutela') },
  [`${BASE}/Proceso/Detalle/63376382`]: { estado: 200, cuerpo: fixture('detalle-tutela') },
  [`${BASE}/Proceso/Actuaciones/63376382?pagina=1`]: {
    estado: 200,
    cuerpo: fixture('actuaciones-tutela'),
  },
  [busqueda(EJECUTIVO)]: { estado: 200, cuerpo: fixture('busqueda-ejecutivo') },
  [`${BASE}/Proceso/Detalle/107906391`]: { estado: 200, cuerpo: fixture('detalle-ejecutivo-tyba') },
  [`${BASE}/Proceso/Actuaciones/107906391?pagina=1`]: {
    estado: 200,
    cuerpo: fixture('actuaciones-ejecutivo-tyba-1'),
  },
  [`${BASE}/Proceso/Actuaciones/107906391?pagina=2`]: {
    estado: 200,
    cuerpo: fixture('actuaciones-ejecutivo-tyba-2'),
  },
  [`${BASE}/Proceso/Detalle/107912231`]: { estado: 200, cuerpo: fixture('detalle-ejecutivo-xxi') },
  [`${BASE}/Proceso/Actuaciones/107912231?pagina=1`]: {
    estado: 200,
    cuerpo: fixture('actuaciones-ejecutivo-xxi'),
  },
  [`${BASE}/Proceso/DocumentosActuacion/3998715741`]: {
    estado: 200,
    cuerpo: fixture('documentos-actuacion'),
  },
  [`${BASE}/Proceso/DocumentosActuacion/1402711252`]: {
    estado: 404,
    cuerpo: fixture('documentos-sin-resultados'),
  },
};

let pausas = 0;

function http(rutas: Record<string, Respuesta>, pedidas: string[] = []): ClienteHttp {
  return {
    pausar() {
      pausas++;
    },
    obtenerTexto: () => Promise.reject(new Error('no se usa en la CPNU')),
    enviarJson: () => Promise.reject(new Error('no se usa en la CPNU')),
    async obtenerJson(url) {
      pedidas.push(url);
      const respuesta = rutas[url];
      if (!respuesta) return ok({ estado: 404, cuerpo: { StatusCode: 404, Message: 'ruta' } });
      return 'tipo' in respuesta ? err(respuesta) : ok(respuesta);
    },
    async obtenerBinario(url) {
      pedidas.push(url);
      if (url.endsWith('/4038108901')) {
        return ok({
          estado: 200,
          contenido: new TextEncoder().encode('%PDF-1.7'),
          tipo: 'application/pdf',
        });
      }
      return ok({ estado: 404, contenido: new Uint8Array(), tipo: null });
    },
  };
}

function cpnu(rutas: Record<string, Respuesta> = RUTAS_REALES, pedidas?: string[]) {
  return crearPlataformaCpnu({
    urlBase: `${BASE}/`,
    http: http(rutas, pedidas),
    logger: silencioso,
  });
}

describe('adaptador CPNU: consulta', () => {
  it('trae el proceso con sus actuaciones y las fechas oficiales de la plataforma', async () => {
    const resultado = await cpnu().consultar(TUTELA, {});
    if (!resultado.ok) throw resultado.error;
    const { expedientes, actuaciones } = resultado.value;

    expect(resultado.value.plataforma).toBe('RAMA_CPNU');
    expect(expedientes).toHaveLength(1);
    expect(expedientes[0]).toMatchObject({
      idExterno: '63376382',
      despachoJudicial: 'JUZGADO 001 CIVIL DEL CIRCUITO DE BOGOTÁ',
      claseProceso: 'Tutelas',
      tipoProceso: 'Acción de Tutela',
      ubicacion: 'Archivo',
      fechaRadicacion: '2019-03-08',
      reservado: false,
    });
    expect(expedientes[0]?.sujetos).toEqual([
      { tipo: 'Demandante', nombre: 'JULIAN ANDRES PRIETO SUAREZ' },
      { tipo: 'Demandante', nombre: 'LUCIA FERNANDA ROJAS PEREZ' },
      { tipo: 'Demandado', nombre: 'CENTRAL DE INVERSIONES' },
    ]);

    expect(actuaciones).toHaveLength(9);
    // La sentencia: actuación del 19/03/2019, registrada por el juzgado el 20/03/2019.
    const sentencia = actuaciones.find(
      (a) => a.descripcion === 'Sentencia tutela primera Instancia',
    );
    expect(sentencia).toMatchObject({
      idExterno: '667081612',
      fechaActuacion: '2019-03-19',
      fechaRegistro: '2019-03-20',
      anotacion: null,
      tieneDocumentos: false,
    });
    expect(actuaciones[0]?.fechaActuacion).toBe('2023-01-31');
  });

  it('une los expedientes de un mismo radicado en una sola línea de tiempo, con todas sus páginas', async () => {
    const pedidas: string[] = [];
    const resultado = await cpnu(RUTAS_REALES, pedidas).consultar(EJECUTIVO, {});
    if (!resultado.ok) throw resultado.error;
    const { expedientes, actuaciones } = resultado.value;

    // Tyba (52 actuaciones en 2 páginas) + el sistema anterior (21).
    expect(actuaciones).toHaveLength(73);
    expect(new Set(actuaciones.map((a) => a.idExterno)).size).toBe(73);
    expect(pedidas).toContain(`${BASE}/Proceso/Actuaciones/107906391?pagina=2`);
    // El expediente vivo (actuación más reciente) primero.
    expect(expedientes.map((e) => e.idExterno)).toEqual(['107906391', '107912231']);
    expect(expedientes[0]?.ubicacion).toBe('Software: Justicia XXI Web');
    // Orden de la línea de tiempo: la más reciente primero.
    const fechas = actuaciones.map((a) => a.fechaActuacion);
    expect([...fechas].sort().reverse()).toEqual(fechas);
    expect(actuaciones.filter((a) => a.tieneDocumentos).length).toBeGreaterThan(0);
  });

  it('marca como Tyba solo el expediente y las actuaciones de Justicia XXI Web', async () => {
    const mixto = await cpnu().consultar(EJECUTIVO, {});
    if (!mixto.ok) throw mixto.error;
    const porExpediente = new Map(mixto.value.expedientes.map((e) => [e.idExterno, e]));
    expect(porExpediente.get('107906391')?.sistema).toBe('TYBA');
    expect(porExpediente.get('107912231')?.sistema).toBeUndefined();

    const deTyba = mixto.value.actuaciones.filter((a) => a.origen === 'TYBA');
    const delAnterior = mixto.value.actuaciones.filter((a) => a.origen === undefined);
    // Tyba trae 52 actuaciones (2 páginas) y el sistema anterior, 21: cada una con su origen.
    expect(deTyba).toHaveLength(52);
    expect(delAnterior).toHaveLength(21);
    expect(deTyba.every((a) => a.expediente === '107906391')).toBe(true);

    // Un proceso que nunca estuvo en Tyba no lleva marca.
    const tutela = await cpnu().consultar(TUTELA, {});
    if (!tutela.ok) throw tutela.error;
    expect(tutela.value.expedientes[0]?.sistema).toBeUndefined();
    expect(tutela.value.actuaciones.some((a) => a.origen)).toBe(false);
  });

  it('normaliza los nombres que la plataforma parte con saltos de línea', async () => {
    const resultado = await cpnu().consultar(EJECUTIVO, {});
    if (!resultado.ok) throw resultado.error;
    expect(resultado.value.expedientes[0]?.sujetos).toContainEqual({
      tipo: 'Defensor Privado',
      nombre: 'PAULA ANDREA OSORIO RUIZ',
    });
  });

  it('un radicado sin resultados es NO_ENCONTRADO', async () => {
    const resultado = await cpnu({
      [busqueda(TUTELA)]: { estado: 200, cuerpo: fixture('busqueda-sin-resultados') },
    }).consultar(TUTELA, {});
    expect(resultado.ok || resultado.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('ignora resultados de otro radicado aunque la plataforma los devuelva', async () => {
    const otro = structuredClone(fixture('busqueda-tutela')) as {
      procesos: { llaveProceso: string }[];
    };
    for (const p of otro.procesos) p.llaveProceso = '11001310300120190012301';
    const resultado = await cpnu({ [busqueda(TUTELA)]: { estado: 200, cuerpo: otro } }).consultar(
      TUTELA,
      {},
    );
    expect(resultado.ok || resultado.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un proceso reservado se informa sin actuaciones y sin pedir su detalle', async () => {
    const reservado = structuredClone(fixture('busqueda-tutela')) as {
      procesos: { esPrivado: boolean }[];
    };
    for (const p of reservado.procesos) p.esPrivado = true;
    const pedidas: string[] = [];
    const resultado = await cpnu(
      { [busqueda(TUTELA)]: { estado: 200, cuerpo: reservado } },
      pedidas,
    ).consultar(TUTELA, {});
    if (!resultado.ok) throw resultado.error;
    expect(resultado.value.expedientes[0]?.reservado).toBe(true);
    expect(resultado.value.actuaciones).toEqual([]);
    expect(pedidas).toHaveLength(1);
  });

  it('si el formato de la respuesta cambió, es RESPUESTA_INESPERADA (sin detalles para la persona)', async () => {
    const cambiada = structuredClone(fixture('actuaciones-tutela')) as {
      actuaciones: { fechaActuacion: string }[];
    };
    if (cambiada.actuaciones[0]) cambiada.actuaciones[0].fechaActuacion = '31/01/2023';
    const resultado = await cpnu({
      ...RUTAS_REALES,
      [`${BASE}/Proceso/Actuaciones/63376382?pagina=1`]: { estado: 200, cuerpo: cambiada },
    }).consultar(TUTELA, {});
    if (resultado.ok) throw new Error('debía fallar');
    expect(resultado.error.codigo).toBe('RESPUESTA_INESPERADA');
    expect(resultado.error.mensajeUsuario).not.toMatch(/fecha inválida|31\/01/);
    expect(resultado.error.detalleTecnico).toContain('fecha inválida');
  });

  it('un error de la API en la búsqueda (p. ej. 404 con mensaje) es RESPUESTA_INESPERADA', async () => {
    const resultado = await cpnu({
      [busqueda(TUTELA)]: {
        estado: 404,
        cuerpo: {
          StatusCode: 404,
          Message: 'El parametro "NumeroRadicacion" ha de contener 23 digitos.',
        },
      },
    }).consultar(TUTELA, {});
    expect(resultado.ok || resultado.error.codigo).toBe('RESPUESTA_INESPERADA');
  });

  it('un 403 (el cortafuegos de la CPNU) es «pidió esperar» y pausa la plataforma', async () => {
    pausas = 0;
    const resultado = await cpnu({ [busqueda(TUTELA)]: { estado: 403, cuerpo: null } }).consultar(
      TUTELA,
      {},
    );
    if (resultado.ok) throw new Error('debía fallar');
    expect(resultado.error.codigo).toBe('LIMITE_DE_CONSULTAS');
    expect(resultado.error.transitorio).toBe(true);
    expect(pausas).toBe(1);
  });

  it.each([
    [{ tipo: 'NO_DISPONIBLE', detalle: 'HTTP 503' } as const, 'PLATAFORMA_NO_DISPONIBLE', true],
    [{ tipo: 'LIMITE', detalle: 'HTTP 429' } as const, 'LIMITE_DE_CONSULTAS', true],
    [{ tipo: 'FORMATO', detalle: '<html>' } as const, 'RESPUESTA_INESPERADA', false],
  ])('traduce el fallo de red %o a %s', async (fallo, codigo, transitorio) => {
    const resultado = await cpnu({ [busqueda(TUTELA)]: fallo }).consultar(TUTELA, {});
    if (resultado.ok) throw new Error('debía fallar');
    expect(resultado.error.codigo).toBe(codigo);
    expect(resultado.error.transitorio).toBe(transitorio);
  });

  it('respeta el tope de páginas de actuaciones', async () => {
    const pedidas: string[] = [];
    const plataforma = crearPlataformaCpnu({
      urlBase: BASE,
      http: http(RUTAS_REALES, pedidas),
      logger: silencioso,
      maximoDePaginas: 1,
    });
    const resultado = await plataforma.consultar(EJECUTIVO, {});
    if (!resultado.ok) throw resultado.error;
    expect(pedidas).not.toContain(`${BASE}/Proceso/Actuaciones/107906391?pagina=2`);
    expect(resultado.value.actuaciones).toHaveLength(40 + 21);
  });
});

describe('leerSujetos', () => {
  it('lee «Tipo: Nombre | Tipo: Nombre» y descarta partes vacías', () => {
    expect(leerSujetos('Demandante: BANCO X | Demandado: PERSONA Y | ')).toEqual([
      { tipo: 'Demandante', nombre: 'BANCO X' },
      { tipo: 'Demandado', nombre: 'PERSONA Y' },
    ]);
  });

  it('una parte sin tipo queda como «Parte»', () => {
    expect(leerSujetos('SOLO UN NOMBRE')).toEqual([{ tipo: 'Parte', nombre: 'SOLO UN NOMBRE' }]);
    expect(leerSujetos(null)).toEqual([]);
  });
});

describe('descargador CPNU', () => {
  const descargador = crearDescargadorCpnu({
    urlBase: BASE,
    http: http(RUTAS_REALES),
    logger: silencioso,
  });

  it('un 403 al listar o descargar es «pidió esperar» y pausa la plataforma', async () => {
    pausas = 0;
    const bloqueado = crearDescargadorCpnu({
      urlBase: BASE,
      http: {
        ...http({}),
        obtenerJson: async () => ok({ estado: 403, cuerpo: null }),
        obtenerBinario: async () => ok({ estado: 403, contenido: new Uint8Array(), tipo: null }),
      },
      logger: silencioso,
    });
    const lista = await bloqueado.listar('3998715741', {});
    expect(lista.ok || lista.error.codigo).toBe('LIMITE_DE_CONSULTAS');
    const archivo = await bloqueado.descargar('4038108901', 1000, {});
    expect(!archivo.ok && typeof archivo.error !== 'string' && archivo.error.transitorio).toBe(
      true,
    );
    expect(pausas).toBe(2);
  });

  it('lista los documentos de una actuación con su fecha oficial de carga', async () => {
    const lista = await descargador.listar('3998715741', {});
    if (!lista.ok) throw lista.error;
    expect(lista.value).toEqual([
      {
        idExterno: '4038108901',
        nombre: '44AGREGARMEMORIAL.pdf',
        fechaCarga: '2026-10-30',
        urlOrigen: `${BASE}/Descarga/DocumentoActuacion/4038108901`,
      },
    ]);
  });

  it('«No se encontraron documentos» (404 con mensaje) es una lista vacía', async () => {
    const lista = await descargador.listar('1402711252', {});
    expect(lista.ok && lista.value).toEqual([]);
  });

  it('descarga el archivo; un 404 es NO_ENCONTRADO (no disponible por ahora)', async () => {
    const archivo = await descargador.descargar('4038108901', 1000, {});
    expect(archivo.ok && archivo.value.tipoDeclarado).toBe('application/pdf');
    const ausente = await descargador.descargar('1', 1000, {});
    expect(!ausente.ok && typeof ausente.error !== 'string' && ausente.error.codigo).toBe(
      'NO_ENCONTRADO',
    );
  });
});
