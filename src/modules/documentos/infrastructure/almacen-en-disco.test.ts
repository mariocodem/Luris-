import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAlmacenEnDisco } from './almacen-en-disco';

const DESPACHO = '00000000-0000-7000-8000-000000000001';
const contenido = new TextEncoder().encode('%PDF-1.7 auto que admite la demanda');
const sha = createHash('sha256').update(contenido).digest('hex');

let directorio: string;
beforeEach(async () => {
  directorio = await mkdtemp(path.join(tmpdir(), 'luris-almacen-'));
});
afterEach(async () => {
  await rm(directorio, { recursive: true, force: true });
});

async function leerTodo(flujo: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(flujo).text();
}

describe('almacén en disco', () => {
  it('guarda en la carpeta del despacho con el SHA-256 como nombre', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    const guardado = await almacen.guardar(DESPACHO, contenido);
    expect(guardado).toEqual({
      ruta: `${DESPACHO}/${sha.slice(0, 2)}/${sha}`,
      sha256: sha,
      tamanoBytes: contenido.byteLength,
    });
    const abierto = await almacen.abrir(guardado.ruta);
    expect(abierto && (await leerTodo(abierto))).toBe('%PDF-1.7 auto que admite la demanda');
  });

  it('deduplica: el mismo documento se guarda una sola vez por despacho', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    await almacen.guardar(DESPACHO, contenido);
    await almacen.guardar(DESPACHO, contenido);
    expect(await readdir(path.join(directorio, DESPACHO, sha.slice(0, 2)))).toEqual([sha]);
  });

  it('nunca comparte archivos entre despachos', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    const a = await almacen.guardar(DESPACHO, contenido);
    const b = await almacen.guardar('00000000-0000-7000-8000-000000000002', contenido);
    expect(a.ruta).not.toBe(b.ruta);
  });

  // Windows no aplica permisos POSIX (stat siempre informa 666/777); en Linux, donde corre el
  // contenedor de producción, la prueba sí verifica 600/700.
  it.skipIf(process.platform === 'win32')('escribe con permisos restrictivos', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    const { ruta } = await almacen.guardar(DESPACHO, contenido);
    expect((await stat(path.join(directorio, ruta))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(directorio, DESPACHO))).mode & 0o777).toBe(0o700);
  });

  it('un archivo ausente se informa como null', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    expect(await almacen.abrir(`${DESPACHO}/ab/${'a'.repeat(64)}`)).toBeNull();
  });

  it('rechaza rutas que intenten salir del almacén', async () => {
    const almacen = crearAlmacenEnDisco({ directorio });
    await expect(almacen.abrir('../../etc/passwd')).rejects.toThrow();
    await expect(almacen.guardar('../otro', contenido)).rejects.toThrow();
  });
});
