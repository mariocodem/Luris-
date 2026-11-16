import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ErrorInesperado } from '@/shared/domain/app-error';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { CorreoSaliente, EnviadorDeCorreos } from '../../domain/enviador-de-correos';

/**
 * Buzón de DESARROLLO: guarda cada correo como un archivo .html para abrirlo en el navegador.
 * La validación del entorno impide usarlo en producción (los correos llevan enlaces de acceso).
 * En el log solo queda el nombre del archivo, nunca el contenido.
 */
export function crearEnviadorEnArchivo(opciones: {
  readonly directorio: string;
  readonly remitente: string;
  readonly logger: Logger;
}): EnviadorDeCorreos {
  const directorio = path.resolve(opciones.directorio);

  return {
    async enviar(correo: CorreoSaliente) {
      const nombre = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.html`;
      const archivo = path.join(directorio, nombre);
      try {
        await mkdir(directorio, { recursive: true });
        await writeFile(archivo, documento(opciones.remitente, correo), 'utf8');
        opciones.logger.info('Correo de desarrollo guardado', { archivo, asunto: correo.asunto });
        return ok(undefined);
      } catch (causa) {
        return err(new ErrorInesperado(causa, 'No se pudo guardar el correo de desarrollo'));
      }
    },
  };
}

function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function documento(remitente: string, correo: CorreoSaliente): string {
  return `<!doctype html>
<html lang="es-CO">
<head><meta charset="utf-8"><title>${escapar(correo.asunto)}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto;">
<dl style="color:#555;font-size:14px">
  <dt>De</dt><dd>${escapar(remitente)}</dd>
  <dt>Para</dt><dd>${escapar(correo.para)}</dd>
  <dt>Asunto</dt><dd>${escapar(correo.asunto)}</dd>
</dl>
<hr>
${correo.html}
</body>
</html>
`;
}
