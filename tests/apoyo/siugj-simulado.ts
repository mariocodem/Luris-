import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Portal SIUGJ simulado para las pruebas (unidad del adaptador y e2e). Nunca se consulta el SIUGJ
 * real desde las pruebas.
 *
 * - Ingreso: replica lo CONFIRMADO del portal real (17/11/2026): /principalPortal/index.php con
 *   #txtUsuario, #txtPasswd, el error en #lblErr1 y la ventana del código de acceso
 *   (#txtCodigoAcceso, botón «Aceptar»); al entrar, /principalPortal/inicio.php.
 * - Expediente, actuaciones y documentos: modelo PROVISIONAL (ver mapa-del-portal.ts).
 *
 * Cuentas: «abogado.siugj» / «clave-correcta» entra directo; «abogada.2fa» / «clave-correcta»
 * pide el código «246810»; cualquier otra combinación es rechazada.
 * Expedientes: RADICADO_CON_ACCESO (con actuaciones y un documento), RADICADO_SIN_ACCESO y
 * cualquier otro, no encontrado.
 */

export const RADICADO_CON_ACCESO = '05001310500220250012300';
export const RADICADO_SIN_ACCESO = '05001310500320250004500';
export const CODIGO_DE_ACCESO = '246810';

const CUENTAS: Record<string, { readonly clave: string; readonly dosFactores: boolean }> = {
  'abogado.siugj': { clave: 'clave-correcta', dosFactores: false },
  'abogada.2fa': { clave: 'clave-correcta', dosFactores: true },
};

/** PDF mínimo de una página en blanco. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

export interface EstadoDelSimulado {
  /** Ingresos con usuario y contraseña (para comprobar que la sesión se reutiliza). */
  ingresos: number;
  /** Códigos de acceso enviados (uno por ingreso de una cuenta con segundo factor). */
  codigosEnviados: number;
  /** Actuaciones extra del expediente con acceso (para probar las nuevas). */
  actuacionesExtra: { id: string; fecha: string; descripcion: string }[];
}

export interface SiugjSimulado {
  readonly url: string;
  readonly estado: EstadoDelSimulado;
  /** Cierra todas las sesiones (como si vencieran en el portal). */
  expirarSesiones(): void;
  cerrar(): Promise<void>;
}

function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title></head><body>${cuerpo}</body></html>`;
}

const PAGINA_DE_INGRESO = pagina(
  'Sistema Integrado de Gestión Judicial',
  `<form method="post" action="index.php#" onsubmit="autenticar(); return false;">
  <input type="hidden" name="csrf_token" value="simulado">
  <label>Usuario <input id="txtUsuario" name="txtUsuario" type="text"></label>
  <label>Contraseña <input id="txtPasswd" name="txtPasswd" type="password"></label>
  <span id="lblErr1" style="display:none"></span>
  <button type="submit">Ingresar</button>
</form>
<div id="ventana2FA"></div>
<script>
async function enviar(datos) {
  const r = await fetch('../paginasFunciones/funciones.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(datos),
  });
  return (await r.text()).split('|');
}
function mostrarError(texto) {
  const e = document.getElementById('lblErr1');
  e.textContent = texto;
  e.style.display = 'inline';
}
async function autenticar() {
  const r = await enviar({ funcion: '8', l: txtUsuario.value, p: txtPasswd.value });
  if (r[1] === '1') location.href = '../principalPortal/inicio.php';
  else if (r[1] === '2') mostrarVentana2FA(r[2]);
  else if (r[1] === '3') mostrarError('Cuenta Bloqueada');
  else mostrarError('Usuario o contraseña incorrectos');
}
function mostrarVentana2FA(iU) {
  document.getElementById('ventana2FA').innerHTML =
    '<div class="x-window"><span>Ingrese el Código de Acceso:</span>' +
    '<input id="txtCodigoAcceso" type="text"><button type="button" id="btnCodigo">Aceptar</button>' +
    '<span id="msgCodigo"></span></div>';
  document.getElementById('btnCodigo').onclick = async () => {
    const r = await enviar({ funcion: '9', iU, c: txtCodigoAcceso.value });
    if (r[1] === '1') location.href = '../principalPortal/inicio.php';
    else document.getElementById('msgCodigo').textContent = 'El código de acceso es incorrecto';
  };
}
</script>`,
);

function expediente(estado: EstadoDelSimulado): string {
  const actuaciones = [
    ...estado.actuacionesExtra,
    {
      id: 'act-2',
      fecha: '04/11/2026',
      descripcion: 'Auto que fija fecha de audiencia',
      registro: '05/11/2026',
      documentos: true,
    },
    {
      id: 'act-1',
      fecha: '15/03/2025',
      descripcion: 'Radicación de demanda',
      registro: '15/03/2025',
      documentos: false,
    },
  ];
  const filas = actuaciones
    .map(
      (a) => `<tr data-siugj="actuacion" data-id="${a.id}">
  <td data-siugj="fecha-actuacion">${a.fecha}</td>
  <td data-siugj="fecha-registro">${'registro' in a ? a.registro : a.fecha}</td>
  <td data-siugj="descripcion">${a.descripcion}</td>
  <td data-siugj="anotacion">Anotación de ${a.descripcion.toLowerCase()}</td>
  ${'documentos' in a && a.documentos ? '<td data-siugj="con-documentos">Documentos</td>' : '<td></td>'}
</tr>`,
    )
    .join('');
  return pagina(
    'Expediente',
    `<section data-siugj="expediente">
  <h1>Proceso ordinario laboral</h1>
  <p data-siugj="despacho">Juzgado 002 Laboral del Circuito de Medellín</p>
  <p data-siugj="clase">Ordinario laboral de primera instancia</p>
  <p data-siugj="fecha-radicacion">15/03/2025</p>
  <ul>
    <li data-siugj="sujeto"><span data-siugj="tipo">Demandante</span> <span data-siugj="nombre">Jorge Pérez</span></li>
    <li data-siugj="sujeto"><span data-siugj="tipo">Demandado</span> <span data-siugj="nombre">Industrias del Valle S.A.S.</span></li>
  </ul>
  <table><tbody>${filas}</tbody></table>
</section>`,
  );
}

async function cuerpo(peticion: IncomingMessage): Promise<URLSearchParams> {
  const partes: Buffer[] = [];
  for await (const parte of peticion) partes.push(parte as Buffer);
  return new URLSearchParams(Buffer.concat(partes).toString('utf8'));
}

function cookie(peticion: IncomingMessage, nombre: string): string | null {
  const cabecera = peticion.headers.cookie ?? '';
  const par = cabecera
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([n]) => n === nombre);
  return par?.[1] ?? null;
}

export async function iniciarSiugjSimulado(puerto = 0, prefijo = ''): Promise<SiugjSimulado> {
  const estado: EstadoDelSimulado = { ingresos: 0, codigosEnviados: 0, actuacionesExtra: [] };
  const sesiones = new Set<string>();
  const pendientes = new Map<string, string>();

  function responder(r: ServerResponse, codigo: number, contenido: string, tipo = 'text/html') {
    r.writeHead(codigo, { 'Content-Type': `${tipo}; charset=utf-8` });
    r.end(contenido);
  }

  function abrirSesion(r: ServerResponse) {
    const id = randomUUID();
    sesiones.add(id);
    r.setHeader('Set-Cookie', `PHPSESSID=${id}; Path=/; HttpOnly`);
  }

  async function manejar(peticion: IncomingMessage, r: ServerResponse): Promise<void> {
    const url = new URL(peticion.url ?? '/', 'http://localhost');
    const ruta = url.pathname.slice(prefijo.length);
    const conSesion = sesiones.has(cookie(peticion, 'PHPSESSID') ?? '');

    if (ruta === '/principalPortal/index.php') return responder(r, 200, PAGINA_DE_INGRESO);
    if (ruta === '/paginasFunciones/funciones.php' && peticion.method === 'POST') {
      const datos = await cuerpo(peticion);
      if (datos.get('funcion') === '8') {
        estado.ingresos++;
        const cuenta = CUENTAS[datos.get('l') ?? ''];
        if (!cuenta || cuenta.clave !== datos.get('p'))
          return responder(r, 200, '1|0', 'text/plain');
        if (cuenta.dosFactores) {
          const iU = randomUUID();
          pendientes.set(iU, CODIGO_DE_ACCESO);
          estado.codigosEnviados++;
          return responder(r, 200, `1|2|${iU}`, 'text/plain');
        }
        abrirSesion(r);
        return responder(r, 200, '1|1', 'text/plain');
      }
      if (datos.get('funcion') === '9') {
        const esperado = pendientes.get(datos.get('iU') ?? '');
        if (!esperado || esperado !== datos.get('c')) return responder(r, 200, '1|0', 'text/plain');
        pendientes.delete(datos.get('iU') ?? '');
        abrirSesion(r);
        return responder(r, 200, '1|1', 'text/plain');
      }
    }

    // Lo que sigue exige sesión, como el portal real.
    if (!conSesion) {
      r.writeHead(302, { Location: `${prefijo}/principalPortal/index.php` });
      r.end();
      return;
    }
    if (ruta === '/principalPortal/inicio.php') {
      return responder(r, 200, pagina('Inicio', '<h1>Bienvenido a SIUGJ</h1>'));
    }
    if (ruta === '/principalPortal/consultarExpediente.php') {
      const cup = url.searchParams.get('cup');
      if (cup === RADICADO_CON_ACCESO) return responder(r, 200, expediente(estado));
      if (cup === RADICADO_SIN_ACCESO) {
        return responder(
          r,
          200,
          pagina(
            'Sin acceso',
            '<p data-siugj="sin-acceso">No tiene acceso a este expediente. Solicítelo al despacho judicial.</p>',
          ),
        );
      }
      return responder(
        r,
        200,
        pagina('No encontrado', '<p data-siugj="no-encontrado">No se encontró el expediente.</p>'),
      );
    }
    if (ruta === '/principalPortal/documentosActuacion.php') {
      const enlaces =
        url.searchParams.get('actuacion') === 'act-2'
          ? `<a data-siugj="documento" data-fecha="05/11/2026" href="${prefijo}/principalPortal/descargar.php?id=doc-1">Auto que fija fecha de audiencia.pdf</a>`
          : '';
      return responder(r, 200, pagina('Documentos', enlaces));
    }
    if (ruta === '/principalPortal/descargar.php' && url.searchParams.get('id') === 'doc-1') {
      r.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': PDF.length });
      r.end(PDF);
      return;
    }
    responder(r, 404, pagina('No encontrado', '<p>No encontrado</p>'));
  }

  const servidor: Server = createServer((peticion, respuesta) => {
    manejar(peticion, respuesta).catch(() => responder(respuesta, 500, 'error'));
  });
  await new Promise<void>((listo) => servidor.listen(puerto, '127.0.0.1', listo));
  const direccion = servidor.address();
  const real = typeof direccion === 'object' && direccion ? direccion.port : puerto;

  return {
    url: `http://127.0.0.1:${real}${prefijo}`,
    estado,
    expirarSesiones: () => sesiones.clear(),
    cerrar: () => new Promise((listo) => servidor.close(() => listo())),
  };
}
