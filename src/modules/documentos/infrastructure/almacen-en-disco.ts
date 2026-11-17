import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AlmacenDeArchivos } from '../application/puertos';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_RUTA = /^[0-9a-f-]{36}\/[0-9a-f]{2}\/[0-9a-f]{64}$/i;

/**
 * Almacén de documentos en disco (§8; en Docker, el volumen de la app). Cada archivo se guarda
 * con su SHA-256 como nombre dentro de la carpeta del despacho: el mismo documento se guarda una
 * sola vez por despacho, y nunca se comparte entre despachos.
 *
 * Permisos restrictivos (carpetas 700, archivos 600) y escritura atómica (temporal + renombrar),
 * para que un corte a mitad de escritura no deje un archivo incompleto con el nombre final.
 */
export function crearAlmacenEnDisco(opciones: { readonly directorio: string }): AlmacenDeArchivos {
  const raiz = path.resolve(opciones.directorio);

  function absoluta(ruta: string): string {
    if (!FORMATO_RUTA.test(ruta)) throw new Error(`Ruta de almacén inválida: ${ruta}`);
    const resultado = path.resolve(raiz, ruta);
    if (!resultado.startsWith(raiz + path.sep)) throw new Error('Ruta fuera del almacén');
    return resultado;
  }

  return {
    async guardar(despachoId, contenido) {
      if (!FORMATO_UUID.test(despachoId)) throw new Error(`Despacho inválido: ${despachoId}`);
      const sha256 = createHash('sha256').update(contenido).digest('hex');
      const ruta = `${despachoId.toLowerCase()}/${sha256.slice(0, 2)}/${sha256}`;
      const destino = absoluta(ruta);
      const guardado = { ruta, sha256, tamanoBytes: contenido.byteLength };

      const existente = await stat(destino).catch(() => null);
      if (existente?.isFile() && existente.size === contenido.byteLength) return guardado;

      await mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
      const temporal = `${destino}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporal, contenido, { mode: 0o600, flag: 'wx' });
        await rename(temporal, destino);
      } catch (error) {
        await rm(temporal, { force: true });
        throw error;
      }
      return guardado;
    },

    async abrir(ruta) {
      const archivo = absoluta(ruta);
      const datos = await stat(archivo).catch(() => null);
      if (!datos?.isFile()) return null;
      return Readable.toWeb(createReadStream(archivo)) as ReadableStream<Uint8Array>;
    },
  };
}
