import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import {
  corporacionesDondeBuscar,
  esDeLoContenciosoAdministrativo,
} from '../../domain/jurisdiccion';
import type { ClienteHttp, FalloHttp, RespuestaJson } from '../http/cliente-http';
import { crearSesionWeb } from '../http/sesion-web';
import { crearPlataformaSamai } from './adaptador-samai';
import { crearVerificadorSamai } from './verificador-samai';

/** SAMAI (Fase 7) con respuestas grabadas del servicio real (nombres cambiados por ficticios). */

const BASE = 'https://samai.test';
const TRIBUNAL = '05001233300020160013200';
const CONSEJO = '05001233300020210149501';
const fixture = (nombre: string) =>
  readFileSync(path.join(process.cwd(), 'tests/fixtures/samai', nombre), 'utf8');
const json = (nombre: string) => JSON.parse(fixture(nombre)) as unknown;

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

describe('jurisdicción por el radicado', () => {
  it('reconoce los procesos de lo contencioso administrativo (03, 23, 33)', () => {
    expect(esDeLoContenciosoAdministrativo(TRIBUNAL)).toBe(true);
    expect(esDeLoContenciosoAdministrativo('11001033700020190012300')).toBe(true);
    expect(esDeLoContenciosoAdministrativo('11001333503320230015600')).toBe(true);
    // Civil municipal y civil del circuito: no son de SAMAI.
    expect(esDeLoContenciosoAdministrativo('50001400300120210034300')).toBe(false);
    expect(esDeLoContenciosoAdministrativo('11001310300120190012300')).toBe(false);
    expect(esDeLoContenciosoAdministrativo('123')).toBe(false);
  });

  it('busca en la corporación de origen y luego en el Consejo de Estado', () => {
    expect(corporacionesDondeBuscar(TRIBUNAL)).toEqual(['0500123', '1100103']);
    expect(corporacionesDondeBuscar('11001032400020190012300')).toEqual(['1100103']);
  });
});

type Respuesta = RespuestaJson | FalloHttp;

function http(porCorporacion: Record<string, Respuesta>) {
  const cuerpos: unknown[] = [];
  let pausas = 0;
  const cliente: ClienteHttp = {
    async enviarJson(_url, cuerpo) {
      cuerpos.push(cuerpo);
      const respuesta = porCorporacion[(cuerpo as { corporacion: string }).corporacion];
      if (!respuesta) return ok({ estado: 200, cuerpo: json('buscar-sin-resultados.json') });
      return 'tipo' in respuesta ? err(respuesta) : ok(respuesta);
    },
    obtenerJson: () => Promise.reject(new Error('no se usa')),
    obtenerTexto: () => Promise.reject(new Error('no se usa')),
    obtenerBinario: () => Promise.reject(new Error('no se usa')),
    pausar() {
      pausas++;
    },
  };
  return { cliente, cuerpos, pausas: () => pausas };
}

const samai = (cliente: ClienteHttp) =>
  crearPlataformaSamai({ urlBase: `${BASE}/`, http: cliente, logger: silencioso });

describe('adaptador SAMAI (búsqueda pública, sin reto)', () => {
  it('trae los datos del proceso y el enlace a su página; las actuaciones llegan por la CPNU', async () => {
    const { cliente, cuerpos } = http({
      '0500123': { estado: 200, cuerpo: json('buscar-tribunal.json') },
    });
    const r = await samai(cliente).consultar(TRIBUNAL, {});
    if (!r.ok) throw r.error;
    expect(r.value).toMatchObject({ plataforma: 'SAMAI', actuaciones: [], soloDatos: true });
    expect(r.value.expedientes[0]).toMatchObject({
      idExterno: '050012333000201600132000500123',
      despachoJudicial: 'Despacho Transitorio 803 Tribunal Administrativo de Antioquia',
      claseProceso: 'ACCIÓN DE NULIDAD Y RESTABLECIMIENTO DEL DERECHO',
      fechaRadicacion: '2016-01-26',
      reservado: false,
      urlDeConsulta: `${BASE}/Vistas/Casos/list_procesos.aspx?guid=050012333000201600132000500123`,
      sujetos: [
        { tipo: 'Demandante', nombre: 'MARTA LUCIA HERRERA CANO' },
        {
          tipo: 'Demandado',
          nombre: 'LA NACION -DIRECCION EJECUTIVA DE ADMINISTRACION JUDICIAL DE ANTIOQUIA- Y OTROS',
        },
      ],
    });
    // SAMAI rellena con «_RDRQ_NULL»: no se muestra.
    expect(r.value.expedientes[0]?.detalles).toEqual([
      { etiqueta: 'Vigente', valor: 'No' },
      { etiqueta: 'Titular del despacho', valor: 'DIANA PATRICIA MORENO ROA' },
      { etiqueta: 'Asunto', valor: 'CONJUEZ LUZ ADRIANA CASTRO PEÑA' },
    ]);
    expect(cuerpos).toEqual([
      expect.objectContaining({ criterio: TRIBUNAL, corporacion: '0500123' }),
    ]);
  });

  it('si no está en la corporación de origen, lo busca en el Consejo de Estado (segunda instancia)', async () => {
    const { cliente, cuerpos } = http({
      '1100103': { estado: 200, cuerpo: json('buscar-consejo-de-estado.json') },
    });
    const r = await samai(cliente).consultar(CONSEJO, {});
    expect(r.ok && r.value.expedientes[0]?.idExterno).toBe('050012333000202101495011100103');
    expect(cuerpos.map((c) => (c as { corporacion: string }).corporacion)).toEqual([
      '0500123',
      '1100103',
    ]);
  });

  it('sin resultados en ninguna, NO_ENCONTRADO', async () => {
    const r = await samai(http({}).cliente).consultar(TRIBUNAL, {});
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un error de la búsqueda es RESPUESTA_INESPERADA; un 403 pausa y pide esperar', async () => {
    const conError = await samai(
      http({ '0500123': { estado: 400, cuerpo: json('buscar-sin-corporacion.json') } }).cliente,
    ).consultar(TRIBUNAL, {});
    expect(conError.ok || conError.error.codigo).toBe('RESPUESTA_INESPERADA');

    const bloqueo = http({ '0500123': { estado: 403, cuerpo: null } });
    const r = await samai(bloqueo.cliente).consultar(TRIBUNAL, {});
    expect(r.ok || r.error.codigo).toBe('LIMITE_DE_CONSULTAS');
    expect(bloqueo.pausas()).toBe(1);
  });

  it('nunca enlaza fuera de SAMAI', async () => {
    const respuesta = structuredClone(json('buscar-tribunal.json')) as {
      data: { items: { urlDetalle: string }[] };
    };
    for (const item of respuesta.data.items) item.urlDetalle = 'https://otro.sitio/x';
    const r = await samai(
      http({ '0500123': { estado: 200, cuerpo: respuesta } }).cliente,
    ).consultar(TRIBUNAL, {});
    expect(r.ok && r.value.expedientes[0]?.urlDeConsulta).toBeNull();
  });
});

// ─── Ingreso con la cuenta del abogado ────────────────────────────────────────

const LOGIN = fixture('login.html');
const PORTADA = '<!doctype html><html><body><a href="/Logout.aspx">Cerrar sesión</a></body></html>';
const sinLimite = { esperarTurno: () => Promise.resolve('LISTO' as const), pausar() {} };

/** Un SAMAI simulado: GET del ingreso, y POST que acepta solo «abogada» / «correcta». */
function samaiSimulado(opciones: { reto?: boolean } = {}) {
  const peticiones: {
    metodo: string;
    url: string;
    cookie: string | null;
    cuerpo: string | null;
  }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (entrada, init) => {
    const url = new URL(String(entrada));
    const cuerpo = typeof init?.body === 'string' ? init.body : null;
    peticiones.push({
      metodo: init?.method ?? 'GET',
      url: url.toString(),
      cookie: new Headers(init?.headers).get('cookie'),
      cuerpo,
    });
    if (url.pathname === '/Login.aspx' && init?.method === 'POST') {
      const datos = new URLSearchParams(cuerpo ?? '');
      const acepta =
        datos.get('ctl00$MainContent$UserNames') === 'abogada' &&
        datos.get('ctl00$MainContent$Password') === 'correcta';
      if (acepta) {
        return new Response(null, {
          status: 302,
          headers: {
            location: '/Vistas/Casos/procesos.aspx',
            'set-cookie': '.ASPXAUTH=sesion; path=/; HttpOnly',
          },
        });
      }
      const conReto = opciones.reto ? LOGIN.replace('</form>', 'No soy un robot</form>') : LOGIN;
      return new Response(conReto, { status: 200 });
    }
    if (url.pathname === '/Login.aspx') {
      return new Response(LOGIN, {
        status: 200,
        headers: { 'set-cookie': '__AntiXsrfToken=abc123; path=/; secure; HttpOnly' },
      });
    }
    return new Response(PORTADA, { status: 200 });
  });
  const verificador = crearVerificadorSamai({
    urlBase: BASE,
    crearSesion: () =>
      crearSesionWeb({
        userAgent: 'LURIS/prueba',
        tiempoLimiteMs: 1000,
        limitador: sinLimite,
        fetch,
      }),
  });
  return { verificador, peticiones };
}

describe('verificador de acceso a SAMAI', () => {
  it('ingresa con el formulario real: envía su estado oculto, el usuario y la contraseña, y conserva las cookies', async () => {
    const { verificador, peticiones } = samaiSimulado();
    const r = await verificador.verificar('abogada', 'correcta', {}, 'credencial-1');
    expect(r.ok).toBe(true);

    const [inicio, envio, destino] = peticiones;
    expect(inicio).toMatchObject({ metodo: 'GET', url: `${BASE}/Login.aspx` });
    expect(envio?.metodo).toBe('POST');
    const campos = new URLSearchParams(envio?.cuerpo ?? '');
    expect(campos.get('__VIEWSTATE')).toBeTruthy();
    expect(campos.get('__EVENTVALIDATION')).toBeTruthy();
    expect(campos.get('ctl00$MainContent$BtnIngresar')).toBe('Ingresar');
    expect(envio?.cookie).toContain('__AntiXsrfToken=abc123');
    // Tras el POST, la redirección se sigue con GET y con la cookie de sesión.
    expect(destino).toMatchObject({ metodo: 'GET', url: `${BASE}/Vistas/Casos/procesos.aspx` });
    expect(destino?.cookie).toContain('.ASPXAUTH=sesion');
  });

  it('si vuelve al formulario de ingreso, la contraseña no fue aceptada', async () => {
    const r = await samaiSimulado().verificador.verificar(
      'abogada',
      'equivocada',
      {},
      'credencial-1',
    );
    expect(r.ok || r.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(!r.ok && r.error.detalleTecnico).not.toContain('equivocada');
  });

  it('si SAMAI pide un reto, no lo resuelve: requiere a la persona', async () => {
    const r = await samaiSimulado({ reto: true }).verificador.verificar(
      'abogada',
      'mala',
      {},
      'credencial-1',
    );
    expect(r.ok || r.error.codigo).toBe('REQUIERE_INTERVENCION');
  });

  it('nunca envía la contraseña a otro sitio', async () => {
    const otroSitio = LOGIN.replace('action="./Login.aspx"', 'action="https://otro.sitio/robar"');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(otroSitio, { status: 200 }),
    );
    const verificador = crearVerificadorSamai({
      urlBase: BASE,
      crearSesion: () =>
        crearSesionWeb({
          userAgent: 'LURIS/prueba',
          tiempoLimiteMs: 1000,
          limitador: sinLimite,
          fetch,
        }),
    });
    const r = await verificador.verificar('abogada', 'correcta', {}, 'credencial-1');
    expect(r.ok || r.error.codigo).toBe('RESPUESTA_INESPERADA');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('sesión web', () => {
  it('no reenvía un formulario a otro sitio en una redirección 307', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, { status: 307, headers: { location: 'https://otro.sitio/x' } }),
    );
    const sesion = crearSesionWeb({
      userAgent: 'LURIS/prueba',
      tiempoLimiteMs: 1000,
      limitador: sinLimite,
      fetch,
    });
    const r = await sesion.enviarFormulario(`${BASE}/Login.aspx`, { clave: 'secreta' });
    expect(r.ok || r.error.tipo).toBe('FORMATO');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
