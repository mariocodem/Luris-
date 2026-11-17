import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

/**
 * Servicios de apoyo de las pruebas e2e (los arranca el `webServer` de playwright.config.ts):
 *
 * 1. Una CPNU simulada que responde con las respuestas grabadas de la API real
 *    (tests/fixtures/cpnu). Las pruebas nunca consultan la plataforma real.
 * 2. El worker de LURIS apuntando a esa CPNU simulada y a la base e2e.
 *
 * `/portal-spoa` reemplaza al portal de la Fiscalía en la consulta asistida (el iframe).
 * `/samai/…` simula SAMAI: la búsqueda pública y el ingreso con usuario y contraseña (acepta solo
 * «abogado.samai» / «clave-correcta»).
 * `/salud` responde cuando el worker ya inició. `POST /control/nueva-actuacion` agrega una
 * actuación al proceso ejecutivo, para probar la detección de novedades.
 */

const PUERTO = Number(process.env.CPNU_SIMULADA_PUERTO ?? 3199);
const BASE = '/api/v2';
const FIXTURES = path.join(process.cwd(), 'tests/fixtures/cpnu');
const FIXTURES_SAMAI = path.join(process.cwd(), 'tests/fixtures/samai');
const SAMAI = '/samai';

function fixture(nombre: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${nombre}.json`), 'utf8')) as unknown;
}

interface PaginaDeActuaciones {
  actuaciones: Record<string, unknown>[];
  paginacion: { cantidadRegistros: number };
}

const actuacionesExtra: Record<string, unknown>[] = [];

function paginaConExtras(): PaginaDeActuaciones {
  const pagina = structuredClone(fixture('actuaciones-ejecutivo-tyba-1')) as PaginaDeActuaciones;
  pagina.actuaciones.unshift(...actuacionesExtra);
  pagina.paginacion.cantidadRegistros += actuacionesExtra.length;
  return pagina;
}

const RUTAS: Record<string, () => unknown> = {
  '/Procesos/Consulta/NumeroRadicacion?numero=11001310300120190012300&SoloActivos=false&pagina=1':
    () => fixture('busqueda-tutela'),
  '/Proceso/Detalle/63376382': () => fixture('detalle-tutela'),
  '/Proceso/Actuaciones/63376382?pagina=1': () => fixture('actuaciones-tutela'),
  '/Procesos/Consulta/NumeroRadicacion?numero=50001400300120210034300&SoloActivos=false&pagina=1':
    () => fixture('busqueda-ejecutivo'),
  '/Proceso/Detalle/107906391': () => fixture('detalle-ejecutivo-tyba'),
  '/Proceso/Actuaciones/107906391?pagina=1': paginaConExtras,
  '/Proceso/Actuaciones/107906391?pagina=2': () => fixture('actuaciones-ejecutivo-tyba-2'),
  '/Proceso/Detalle/107912231': () => fixture('detalle-ejecutivo-xxi'),
  '/Proceso/Actuaciones/107912231?pagina=1': () => fixture('actuaciones-ejecutivo-xxi'),
  '/Proceso/DocumentosActuacion/3998715741': () => fixture('documentos-actuacion'),
};

/** PDF mínimo de una página en blanco. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

function json(respuesta: ServerResponse, estado: number, cuerpo: unknown): void {
  respuesta.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  respuesta.end(JSON.stringify(cuerpo));
}

function samai(nombre: string): string {
  return readFileSync(path.join(FIXTURES_SAMAI, nombre), 'utf8');
}

function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let cuerpo = '';
    peticion.setEncoding('utf8');
    peticion.on('data', (parte: string) => (cuerpo += parte));
    peticion.on('end', () => resolve(cuerpo));
  });
}

/** SAMAI simulado: búsqueda pública e ingreso con usuario y contraseña. */
async function atenderSamai(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  ruta: string,
): Promise<void> {
  if (ruta === '/Vistas/Casos/Jprocesos.ashx/buscar' && peticion.method === 'POST') {
    const filtro = JSON.parse(await leerCuerpo(peticion)) as {
      criterio: string;
      corporacion: string;
    };
    const encontrado =
      filtro.criterio === '05001233300020160013200' && filtro.corporacion === '0500123';
    return json(
      respuesta,
      200,
      JSON.parse(samai(encontrado ? 'buscar-tribunal.json' : 'buscar-sin-resultados.json')),
    );
  }
  if (ruta === '/Login.aspx' && peticion.method === 'POST') {
    const campos = new URLSearchParams(await leerCuerpo(peticion));
    const acepta =
      campos.get('ctl00$MainContent$UserNames') === 'abogado.samai' &&
      campos.get('ctl00$MainContent$Password') === 'clave-correcta';
    if (acepta) {
      respuesta.writeHead(302, {
        location: `${SAMAI}/Vistas/Casos/procesos.aspx`,
        'set-cookie': '.ASPXAUTH=simulada; path=/; HttpOnly',
      });
      respuesta.end();
      return;
    }
  }
  if (ruta === '/Login.aspx') {
    respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    respuesta.end(samai('login.html'));
    return;
  }
  respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  respuesta.end(
    '<!doctype html><html><body><a href="/Logout.aspx">Cerrar sesión</a></body></html>',
  );
}

let workerListo = false;

const servidor = createServer((peticion, respuesta) => {
  const url = peticion.url ?? '/';
  if (url === '/salud') {
    respuesta.writeHead(workerListo ? 200 : 503).end(workerListo ? 'ok' : 'iniciando');
    return;
  }
  if (url.startsWith(`${SAMAI}/`)) {
    void atenderSamai(peticion, respuesta, url.slice(SAMAI.length));
    return;
  }
  if (url === '/portal-spoa') {
    respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    respuesta.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Portal simulado</title><p>Portal simulado de la Fiscalía (pruebas)</p></html>',
    );
    return;
  }
  if (peticion.method === 'POST' && url === '/control/nueva-actuacion') {
    actuacionesExtra.unshift({
      idRegActuacion: 4100000000 + actuacionesExtra.length,
      llaveProceso: '50001400300120210034300',
      consActuacion: 200000000 + actuacionesExtra.length,
      fechaActuacion: '2026-11-13T00:00:00',
      actuacion: 'Auto Fija Fecha Audiencia',
      anotacion: 'AUDIENCIA INICIAL',
      fechaInicial: null,
      fechaFinal: null,
      fechaRegistro: '2026-11-14T00:00:00',
      codRegla: '00',
      conDocumentos: false,
      cant: 0,
    });
    json(respuesta, 200, { agregadas: actuacionesExtra.length });
    return;
  }
  if (!url.startsWith(BASE)) {
    respuesta.writeHead(404).end();
    return;
  }
  const ruta = url.slice(BASE.length);
  if (ruta.startsWith('/Descarga/DocumentoActuacion/')) {
    respuesta.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': PDF.length });
    respuesta.end(PDF);
    return;
  }
  const generar = RUTAS[ruta];
  if (generar) return json(respuesta, 200, generar());
  if (ruta.startsWith('/Proceso/DocumentosActuacion/')) {
    return json(respuesta, 404, { StatusCode: 404, Message: 'No se encontraron documentos' });
  }
  if (ruta.startsWith('/Procesos/Consulta/NumeroRadicacion')) {
    return json(respuesta, 200, fixture('busqueda-sin-resultados'));
  }
  json(respuesta, 404, { StatusCode: 404, Message: 'Ruta desconocida en la CPNU simulada' });
});

servidor.listen(PUERTO, () => {
  console.log(`CPNU simulada en http://localhost:${PUERTO}${BASE}`);
});

// El worker de LURIS, contra la CPNU simulada (el resto del entorno lo da playwright.config.ts).
const worker = spawn(process.execPath, ['--import', 'tsx', 'src/worker/index.ts'], {
  env: {
    ...process.env,
    CPNU_URL_BASE: `http://localhost:${PUERTO}${BASE}`,
    CPNU_SOLICITUDES_POR_MINUTO: '600',
    SAMAI_URL_BASE: `http://localhost:${PUERTO}${SAMAI}`,
    SAMAI_SOLICITUDES_POR_MINUTO: '600',
    PLATAFORMAS_TIEMPO_LIMITE_SEGUNDOS: '10',
    SINCRONIZACION_CRON: 'off',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'json',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});

worker.stdout.setEncoding('utf8');
worker.stdout.on('data', (texto: string) => {
  for (const linea of texto.split('\n').filter(Boolean)) {
    if (linea.includes('Worker de LURIS iniciado')) workerListo = true;
    // Solo avisos y errores del worker (nivel ≥ 40 en pino).
    try {
      const registro = JSON.parse(linea) as { level?: number };
      if ((registro.level ?? 0) >= 40) console.log(`[worker] ${linea}`);
    } catch {
      console.log(`[worker] ${linea}`);
    }
  }
});
worker.on('exit', (codigo) => {
  console.log(`[worker] terminó (código ${codigo ?? 'sin código'})`);
  process.exit(codigo ?? 1);
});

function detener(): void {
  worker.kill('SIGTERM');
  servidor.close();
}
process.once('SIGINT', detener);
process.once('SIGTERM', detener);
