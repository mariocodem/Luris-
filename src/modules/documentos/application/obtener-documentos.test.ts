import { describe, expect, it } from 'vitest';
import type { DocumentoExterno } from '@/modules/plataformas/domain/consulta';
import { ErrorPlataforma } from '@/modules/plataformas/domain/errores';
import type { CodigoPlataforma } from '@/modules/plataformas/domain/plataforma';
import type { DescargadorDeDocumentos } from '@/modules/plataformas/domain/puertos';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import { crearObtenerDocumentos } from './obtener-documentos';
import type { AlmacenDeArchivos, RepositorioDeDocumentos } from './puertos';

const DESPACHO = '00000000-0000-7000-8000-000000000001';
const ACTUACION = '00000000-0000-7000-8000-0000000000c1';
const PDF = new TextEncoder().encode('%PDF-1.7 contenido');

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

function referencia(id: string): DocumentoExterno {
  return {
    idExterno: id,
    nombre: `${id}.pdf`,
    fechaCarga: null,
    urlOrigen: `https://p.test/${id}`,
  };
}

function escenario(
  archivos: Record<string, Awaited<ReturnType<DescargadorDeDocumentos['descargar']>>>,
) {
  const documentos = new Map<
    string,
    { id: string; idExterno: string; nombre: string; estado: string }
  >();
  const guardados: string[] = [];
  const repositorio: RepositorioDeDocumentos = {
    async actuacionDeOrigen(_d, id) {
      return id === ACTUACION ? { plataforma: 'RAMA_CPNU', idExterno: '3998715741' } : null;
    },
    async registrarReferencias(_d, _a, referencias) {
      for (const r of referencias) {
        if (!documentos.has(r.idExterno)) {
          documentos.set(r.idExterno, {
            id: `doc-${r.idExterno}`,
            idExterno: r.idExterno,
            nombre: r.nombre,
            estado: 'PENDIENTE',
          });
        }
      }
    },
    async pendientes() {
      return [...documentos.values()].filter((d) => d.estado !== 'DESCARGADO');
    },
    async marcarDescargado(_d, id) {
      const doc = [...documentos.values()].find((d) => d.id === id);
      if (doc) doc.estado = 'DESCARGADO';
    },
    async marcarNoDisponible(_d, id) {
      const doc = [...documentos.values()].find((d) => d.id === id);
      if (doc) doc.estado = 'NO_DISPONIBLE';
    },
    paraAbrir: async () => null,
    procesoDeLaActuacion: async () => null,
    registrarSubido: () => Promise.reject(new Error('no se usa')),
  };
  const descargador: DescargadorDeDocumentos = {
    plataforma: 'RAMA_CPNU',
    listar: async () => ok(Object.keys(archivos).map(referencia)),
    descargar: async (id) => archivos[id] ?? ok({ contenido: PDF, tipoDeclarado: null }),
  };
  const almacen: AlmacenDeArchivos = {
    async guardar(_d, contenido) {
      guardados.push(new TextDecoder().decode(contenido));
      return {
        ruta: `${DESPACHO}/ab/${'a'.repeat(64)}`,
        sha256: 'a'.repeat(64),
        tamanoBytes: contenido.byteLength,
      };
    },
    abrir: async () => null,
  };
  const obtener = crearObtenerDocumentos({
    descargadores: new Map<CodigoPlataforma, DescargadorDeDocumentos>([['RAMA_CPNU', descargador]]),
    documentos: repositorio,
    almacen,
    reloj: { ahora: () => new Date() },
    tamanoMaximoBytes: 1000,
    logger: silencioso,
  });
  return { obtener, documentos, guardados };
}

const SOLICITUD = { despachoId: DESPACHO, actuacionId: ACTUACION };

describe('obtenerDocumentos', () => {
  it('descarga y guarda los documentos válidos', async () => {
    const { obtener, documentos, guardados } = escenario({
      '4038108901': ok({ contenido: PDF, tipoDeclarado: 'application/pdf' }),
    });
    expect(await obtener(SOLICITUD, {})).toEqual(ok({ descargados: 1, noDisponibles: 0 }));
    expect(documentos.get('4038108901')?.estado).toBe('DESCARGADO');
    expect(guardados).toHaveLength(1);
  });

  it('lo que la plataforma no entrega, es demasiado grande o no es un formato admitido queda no disponible', async () => {
    const { obtener, documentos, guardados } = escenario({
      a: err(new ErrorPlataforma('RAMA_CPNU', 'NO_ENCONTRADO', '404')),
      b: err('DEMASIADO_GRANDE'),
      c: ok({ contenido: new TextEncoder().encode('<html>'), tipoDeclarado: 'application/pdf' }),
    });
    expect(await obtener(SOLICITUD, {})).toEqual(ok({ descargados: 0, noDisponibles: 3 }));
    expect([...documentos.values()].map((d) => d.estado)).toEqual([
      'NO_DISPONIBLE',
      'NO_DISPONIBLE',
      'NO_DISPONIBLE',
    ]);
    expect(guardados).toEqual([]);
  });

  it('un fallo pasajero se devuelve para que la cola reintente, sin marcar el documento', async () => {
    const caida = new ErrorPlataforma('RAMA_CPNU', 'PLATAFORMA_NO_DISPONIBLE', '503');
    const { obtener, documentos } = escenario({ a: err(caida) });
    expect(await obtener(SOLICITUD, {})).toEqual(err(caida));
    expect(documentos.get('a')?.estado).toBe('PENDIENTE');
  });

  it('al reintentar, los ya descargados no se vuelven a pedir', async () => {
    const { obtener, guardados } = escenario({ a: ok({ contenido: PDF, tipoDeclarado: null }) });
    await obtener(SOLICITUD, {});
    expect(await obtener(SOLICITUD, {})).toEqual(ok({ descargados: 0, noDisponibles: 0 }));
    expect(guardados).toHaveLength(1);
  });

  it('una actuación de otra plataforma o inexistente no hace nada', async () => {
    const { obtener } = escenario({});
    expect(await obtener({ ...SOLICITUD, actuacionId: 'otra' }, {})).toEqual(
      ok({ descargados: 0, noDisponibles: 0 }),
    );
  });
});
