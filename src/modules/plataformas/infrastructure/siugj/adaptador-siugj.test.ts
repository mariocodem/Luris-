import { chromium } from 'playwright-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CODIGO_DE_ACCESO,
  iniciarSiugjSimulado,
  RADICADO_CON_ACCESO,
  RADICADO_SIN_ACCESO,
  type SiugjSimulado,
} from '../../../../../tests/apoyo/siugj-simulado';
import type { Logger } from '@/shared/domain/logger';
import type { CuentaDePlataforma, ProveedorDeCuentas } from '../../domain/puertos';
import { crearLimitadorDeRitmo } from '../http/limitador-de-ritmo';
import { type AdaptadorSiugj, crearAdaptadorSiugj, leerFechaDelPortal } from './adaptador-siugj';
import { type CanalDeNavegador, crearNavegador } from './navegador';

/**
 * El adaptador de SIUGJ con un navegador real contra el portal SIUGJ simulado
 * (tests/apoyo/siugj-simulado.ts). Nunca se consulta el SIUGJ real. En Windows usa el Edge
 * instalado; en Linux, el Chromium de Playwright. Sin navegador disponible, se omite.
 */

const CANAL: CanalDeNavegador =
  (process.env.LURIS_NAVEGADOR_PRUEBAS as CanalDeNavegador | undefined) ??
  (process.platform === 'win32' ? 'msedge' : 'chromium');

const hayNavegador = await chromium
  .launch({ headless: true, ...(CANAL !== 'chromium' && { channel: CANAL }) })
  .then(async (navegador) => {
    await navegador.close();
    return true;
  })
  .catch(() => false);

const silencioso: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silencioso,
};

const ALCANCE = { despachoId: 'despacho-1', procesoId: 'proceso-1' };

/** Cuenta en memoria: registra lo que el adaptador le pide guardar. */
function cuentaDePrueba(usuario: string, clave = 'clave-correcta') {
  const estado = {
    sesion: null as string | null,
    esperandoCodigo: false,
    rechazada: false,
    guardados: 0,
  };
  const proveedor: ProveedorDeCuentas = {
    async cuentaPara() {
      const cuenta: CuentaDePlataforma = {
        credencialId: `credencial-${usuario}`,
        usuario,
        secreto: clave,
        sesion: estado.sesion,
        esperandoCodigo: estado.esperandoCodigo,
        async guardarSesion(sesion) {
          estado.sesion = sesion;
          estado.esperandoCodigo = false;
          estado.guardados++;
        },
        async olvidarSesion() {
          estado.sesion = null;
        },
        async esperarCodigo() {
          estado.esperandoCodigo = true;
        },
        async registrarRechazo() {
          estado.rechazada = true;
        },
      };
      return cuenta;
    },
  };
  return { proveedor, estado };
}

describe.skipIf(!hayNavegador)('adaptador de SIUGJ (portal simulado, navegador real)', () => {
  let portal: SiugjSimulado;
  const abiertos: AdaptadorSiugj[] = [];

  function adaptador(proveedor: ProveedorDeCuentas): AdaptadorSiugj {
    const nuevo = crearAdaptadorSiugj({
      urlBase: portal.url,
      navegador: crearNavegador({ canal: CANAL, userAgent: 'LURIS/pruebas', logger: silencioso }),
      cuentas: proveedor,
      limitador: crearLimitadorDeRitmo({ solicitudesPorMinuto: 6000 }),
      tiempoLimiteMs: 10_000,
      minutosParaCodigo: 10,
      logger: silencioso,
    });
    abiertos.push(nuevo);
    return nuevo;
  }

  beforeAll(async () => {
    portal = await iniciarSiugjSimulado();
  });

  beforeEach(() => {
    portal.expirarSesiones();
    portal.estado.ingresos = 0;
    portal.estado.codigosEnviados = 0;
  });

  afterAll(async () => {
    for (const a of abiertos) await a.cerrar();
    await portal.cerrar();
  });

  it('ingresa, lee el expediente con fechas oficiales y guarda la sesión', async () => {
    const { proveedor, estado } = cuentaDePrueba('abogado.siugj');
    const r = await adaptador(proveedor).consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [expediente] = r.value.expedientes;
    expect(expediente).toMatchObject({
      despachoJudicial: 'Juzgado 002 Laboral del Circuito de Medellín',
      claseProceso: 'Ordinario laboral de primera instancia',
      fechaRadicacion: '2025-03-15',
      ultimaActuacion: '2026-11-04',
    });
    expect(expediente?.sujetos).toEqual([
      { tipo: 'Demandante', nombre: 'Jorge Pérez' },
      { tipo: 'Demandado', nombre: 'Industrias del Valle S.A.S.' },
    ]);
    expect(r.value.actuaciones[0]).toMatchObject({
      idExterno: 'act-2',
      fechaActuacion: '2026-11-04',
      fechaRegistro: '2026-11-05',
      descripcion: 'Auto que fija fecha de audiencia',
      tieneDocumentos: true,
    });
    expect(r.value.actuaciones).toHaveLength(2);
    expect(estado.sesion).toContain('PHPSESSID');
    expect(portal.estado.ingresos).toBe(1);
  });

  it('reutiliza la sesión guardada: no vuelve a ingresar mientras siga activa', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const siugj = adaptador(proveedor);
    await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(portal.estado.ingresos).toBe(1);

    portal.expirarSesiones();
    const r = await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(r.ok).toBe(true);
    expect(portal.estado.ingresos).toBe(2);
  });

  it('sin acceso al expediente responde SIN_ACCESO con un mensaje que dice a quién pedirlo', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const r = await adaptador(proveedor).consultar(RADICADO_SIN_ACCESO, { alcance: ALCANCE });
    expect(r.ok || r.error.codigo).toBe('SIN_ACCESO');
    expect(!r.ok && r.error.mensajeUsuario).toMatch(/Solicítalo al juzgado/);
  });

  it('un expediente inexistente es NO_ENCONTRADO', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const r = await adaptador(proveedor).consultar('05001310500999202500001', {
      alcance: ALCANCE,
    });
    expect(r.ok || r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('una contraseña rechazada es CREDENCIALES_INVALIDAS y queda registrada en la cuenta', async () => {
    const { proveedor, estado } = cuentaDePrueba('abogado.siugj', 'equivocada');
    const r = await adaptador(proveedor).consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(r.ok || r.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(estado.rechazada).toBe(true);
    expect(!r.ok && r.error.detalleTecnico).not.toContain('equivocada');
  });

  it('sin credencial registrada es SIN_CREDENCIAL, sin abrir el portal', async () => {
    const r = await adaptador({ cuentaPara: async () => null }).consultar(RADICADO_CON_ACCESO, {
      alcance: ALCANCE,
    });
    expect(r.ok || r.error.codigo).toBe('SIN_CREDENCIAL');
    expect(portal.estado.ingresos).toBe(0);
  });

  it('código de acceso: espera a la persona, no reenvía códigos y completa el ingreso con el suyo', async () => {
    const { proveedor, estado } = cuentaDePrueba('abogada.2fa');
    const siugj = adaptador(proveedor);

    const primera = await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(primera.ok || primera.error.codigo).toBe('REQUIERE_INTERVENCION');
    expect(!primera.ok && primera.error.intervencion).toBe('CODIGO_DE_ACCESO');
    expect(estado.esperandoCodigo).toBe(true);

    // Mientras espera, otra consulta no ingresa de nuevo (no se envía otro código).
    await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(portal.estado.codigosEnviados).toBe(1);

    const equivocado = await siugj.completar('credencial-abogada.2fa', '000000', {});
    expect(equivocado).toEqual({ ok: false, error: 'CODIGO_INVALIDO' });

    const correcto = await siugj.completar('credencial-abogada.2fa', CODIGO_DE_ACCESO, {});
    expect(correcto.ok).toBe(true);
    if (!correcto.ok) return;
    expect(correcto.value.sesion).toContain('PHPSESSID');

    // Con la sesión del ingreso completado, la consulta ya no pide código.
    estado.sesion = correcto.value.sesion;
    estado.esperandoCodigo = false;
    const despues = await siugj.consultar(RADICADO_CON_ACCESO, { alcance: ALCANCE });
    expect(despues.ok).toBe(true);
    expect(portal.estado.codigosEnviados).toBe(1);
  });

  it('un código para un ingreso que no existe (o venció) es INGRESO_VENCIDO', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    expect(await adaptador(proveedor).completar('credencial-x', CODIGO_DE_ACCESO, {})).toEqual({
      ok: false,
      error: 'INGRESO_VENCIDO',
    });
  });

  it('lista y descarga los documentos de una actuación con la sesión de la cuenta', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const siugj = adaptador(proveedor);
    const lista = await siugj.listar('act-2', { alcance: ALCANCE });
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.value).toHaveLength(1);
    expect(lista.value[0]).toMatchObject({
      nombre: 'Auto que fija fecha de audiencia.pdf',
      fechaCarga: '2026-11-05',
    });

    const archivo = await siugj.descargar(lista.value[0]?.idExterno ?? '', 1_000_000, {
      alcance: ALCANCE,
    });
    expect(archivo.ok).toBe(true);
    if (!archivo.ok) return;
    expect(Buffer.from(archivo.value.contenido).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('nunca descarga de una dirección de otro sitio', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const r = await adaptador(proveedor).descargar('https://otro-sitio.test/x.pdf', 1000, {
      alcance: ALCANCE,
    });
    expect(r.ok || r.error).not.toBe(true);
    expect(!r.ok && r.error !== 'DEMASIADO_GRANDE' && r.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('verificar devuelve la sesión del ingreso de prueba', async () => {
    const { proveedor } = cuentaDePrueba('abogado.siugj');
    const r = await adaptador(proveedor).verificar(
      'abogado.siugj',
      'clave-correcta',
      {},
      'credencial-1',
    );
    expect(r.ok && r.value.sesion).toContain('PHPSESSID');
  });
});

describe('leerFechaDelPortal', () => {
  it('lee dd/mm/aaaa (con o sin hora) y descarta días inexistentes', () => {
    expect(leerFechaDelPortal('04/11/2026')).toBe('2026-11-04');
    expect(leerFechaDelPortal('04/11/2026 10:35 a. m.')).toBe('2026-11-04');
    expect(leerFechaDelPortal('2026-11-04')).toBe('2026-11-04');
    expect(leerFechaDelPortal('31/02/2026')).toBeNull();
    expect(leerFechaDelPortal(null)).toBeNull();
  });
});
