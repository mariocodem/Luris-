import * as baileys from '@whiskeysockets/baileys';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecretoCifrado } from '@/modules/plataformas/application/puertos';
import { ErrorInesperado } from '@/shared/domain/app-error';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import { crearCifradorAesGcm } from '@/shared/infrastructure/crypto/cifrador-aes-gcm';
import {
  SESION_SIN_VINCULAR,
  type RepositorioDeSesionDeWhatsapp,
  type SesionDeWhatsapp,
} from '../application/puertos';
import type { AvisoDeActuaciones, AvisoDeConsultaMasiva } from '../domain/aviso';
import type { EnviadorDeCorreos } from '../domain/enviador-de-correos';
import { ErrorDeEnvio } from '../domain/notificador';
import { contextoDeQrWhatsapp, contextoDeSesionWhatsapp } from '../domain/whatsapp';
import { clasificarFalloDeSmtp } from './email/enviador-smtp';
import { crearNotificadorDeCorreo } from './email/notificador-de-correo';
import { renderizarAviso } from './email/plantillas/aviso';
import { crearEstadoDeAutenticacion } from './whatsapp/estado-de-autenticacion';
import {
  crearGestorDeWhatsapp,
  type EventosDelSocket,
  type FabricaDeSocket,
  type SocketDeWhatsapp,
} from './whatsapp/gestor-de-whatsapp';
import { crearNotificadorDeWhatsapp } from './whatsapp/notificador-de-whatsapp';

const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

// ─── Estado de autenticación de Baileys ───────────────────────────────────────

describe('estado de autenticación de WhatsApp', () => {
  it('guarda y recupera credenciales y claves (incluidos los Buffers)', () => {
    let cambios = 0;
    const inicial = crearEstadoDeAutenticacion(null, () => (cambios += 1), baileys);
    expect(inicial.estado.creds.noiseKey).toBeDefined();

    const preClave = { private: Buffer.from([1, 2, 3]), public: Buffer.from([4, 5, 6]) };
    void inicial.estado.keys.set({
      'pre-key': { '7': preClave },
      session: { 'abc.0': new Uint8Array([9, 8]) },
    });
    expect(cambios).toBe(1);

    const json = inicial.exportar();
    const recuperado = crearEstadoDeAutenticacion(json, () => undefined, baileys);
    expect(recuperado.estado.creds.advSecretKey).toBe(inicial.estado.creds.advSecretKey);
    const leida = recuperado.estado.keys.get('pre-key', ['7', 'no-existe']) as Record<
      string,
      { private: Buffer; public: Buffer }
    >;
    expect(Buffer.from(leida['7']?.private ?? []).equals(preClave.private)).toBe(true);
    expect(leida['no-existe']).toBeUndefined();
    const sesion = recuperado.estado.keys.get('session', ['abc.0']) as Record<string, Uint8Array>;
    expect([...(sesion['abc.0'] ?? [])]).toEqual([9, 8]);
  });

  it('borrar una clave la quita del estado guardado', () => {
    const estado = crearEstadoDeAutenticacion(null, () => undefined, baileys);
    void estado.estado.keys.set({
      'pre-key': { '1': { private: Buffer.from([1]), public: Buffer.from([2]) } },
    });
    void estado.estado.keys.set({ 'pre-key': { '1': null as never } });
    expect(Object.keys(estado.estado.keys.get('pre-key', ['1']))).toEqual([]);
  });

  it('el JSON usa la codificación de Baileys para los Buffers', () => {
    const estado = crearEstadoDeAutenticacion(null, () => undefined, baileys);
    expect(JSON.parse(estado.exportar(), baileys.BufferJSON.reviver)).toHaveProperty('creds');
  });
});

// ─── Gestor de WhatsApp ───────────────────────────────────────────────────────

function crearSesiones() {
  let sesion: SesionDeWhatsapp = SESION_SIN_VINCULAR;
  let datos: SecretoCifrado | null = null;
  const reinicios: number[] = [];
  const repositorio: RepositorioDeSesionDeWhatsapp = {
    async obtener() {
      return sesion;
    },
    async solicitarVinculacion(_d, ahora) {
      sesion = { ...SESION_SIN_VINCULAR, estado: 'VINCULANDO', vinculacionSolicitadaEn: ahora };
    },
    async actualizar(_d, cambios) {
      sesion = { ...sesion, ...cambios };
    },
    async cargarDatos() {
      return datos;
    },
    async guardarDatos(_d, nuevos) {
      datos = nuevos;
    },
    async reiniciar() {
      reinicios.push(1);
      sesion = SESION_SIN_VINCULAR;
      datos = null;
    },
    async despachosConSesion() {
      return datos ? ['d1'] : [];
    },
  };
  return {
    repositorio,
    reinicios,
    sesion: () => sesion,
    datos: () => datos,
    ponerDatos: (nuevos: SecretoCifrado | null) => {
      datos = nuevos;
    },
  };
}

function crearFabrica() {
  interface Creado {
    readonly datos: string | null;
    readonly eventos: EventosDelSocket;
    readonly socket: SocketDeWhatsapp & {
      enviados: { numero: string; texto: string }[];
      cerrado: number;
      sesionCerrada: boolean;
      respuesta: 'ENVIADO' | 'SIN_WHATSAPP' | 'FALLA';
    };
  }
  const creados: Creado[] = [];
  const fabrica: FabricaDeSocket = {
    async crear(datos, eventos) {
      const socket = {
        enviados: [] as { numero: string; texto: string }[],
        cerrado: 0,
        sesionCerrada: false,
        respuesta: 'ENVIADO' as 'ENVIADO' | 'SIN_WHATSAPP' | 'FALLA',
        async enviarTexto(numero: string, texto: string) {
          if (socket.respuesta === 'FALLA')
            throw new Error('contenido y número que no deben registrarse');
          socket.enviados.push({ numero, texto });
          return socket.respuesta;
        },
        cerrar() {
          socket.cerrado += 1;
        },
        async cerrarSesion() {
          socket.sesionCerrada = true;
        },
        exportarDatos: () =>
          JSON.stringify({ creds: 'secreto-de-la-sesion', numero: creados.length }),
      };
      creados.push({ datos, eventos, socket });
      return socket;
    },
  };
  return { fabrica, creados, ultimo: () => creados[creados.length - 1] as Creado };
}

const cifrador = crearCifradorAesGcm({
  claves: new Map([[1, Buffer.alloc(32, 7)]]),
  versionActual: 1,
});

function gestorDePrueba(opciones: { mensajesPorMinuto?: number } = {}) {
  const sesiones = crearSesiones();
  const f = crearFabrica();
  const esperas: number[] = [];
  const gestor = crearGestorDeWhatsapp({
    sesiones: sesiones.repositorio,
    cifrador,
    fabrica: f.fabrica,
    reloj: { ahora: () => new Date('2026-11-18T15:00:00Z') },
    logger: silencioso,
    mensajesPorMinuto: opciones.mensajesPorMinuto ?? 6,
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
  return { gestor, sesiones, f, esperas };
}

describe('gestor de WhatsApp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('vincular deja el QR cifrado, nunca en claro', async () => {
    const { gestor, sesiones, f } = gestorDePrueba();
    await gestor.vincular('d1');
    expect(f.ultimo().datos).toBeNull();
    expect(sesiones.sesion().estado).toBe('VINCULANDO');

    f.ultimo().eventos.alQr('2@codigo-qr-de-prueba');
    await vi.waitFor(() => expect(sesiones.sesion().qr).not.toBeNull());
    const qr = sesiones.sesion().qr as SecretoCifrado;
    expect(Buffer.from(qr.datos).toString('utf8')).not.toContain('codigo-qr');
    expect(cifrador.descifrar(qr, contextoDeQrWhatsapp('d1'))).toBe('2@codigo-qr-de-prueba');
    // El QR de un despacho no sirve en otro.
    expect(cifrador.descifrar(qr, contextoDeQrWhatsapp('d2'))).toBeNull();
    await gestor.cerrar();
  });

  it('al escanear, queda conectado con su número y la sesión guardada cifrada', async () => {
    const { gestor, sesiones, f } = gestorDePrueba();
    await gestor.vincular('d1');
    f.ultimo().eventos.alQr('2@qr');
    f.ultimo().eventos.alAbrir('573001234567');
    await vi.waitFor(() => expect(sesiones.sesion().estado).toBe('CONECTADA'));
    expect(sesiones.sesion()).toMatchObject({
      numero: '573001234567',
      qr: null,
      qrGeneradoEn: null,
    });
    expect(gestor.estaConectado('d1')).toBe(true);

    const guardados = sesiones.datos() as SecretoCifrado;
    expect(Buffer.from(guardados.datos).toString('utf8')).not.toContain('secreto-de-la-sesion');
    expect(cifrador.descifrar(guardados, contextoDeSesionWhatsapp('d1'))).toContain(
      'secreto-de-la-sesion',
    );
    expect(cifrador.descifrar(guardados, contextoDeSesionWhatsapp('d2'))).toBeNull();
    await gestor.cerrar();
  });

  async function conectado(opciones: { mensajesPorMinuto?: number } = {}) {
    const e = gestorDePrueba(opciones);
    await e.gestor.vincular('d1');
    e.f.ultimo().eventos.alAbrir('573001234567');
    await vi.waitFor(() => expect(e.gestor.estaConectado('d1')).toBe(true));
    return e;
  }

  it('envía el texto por la sesión del despacho', async () => {
    const { gestor, f } = await conectado();
    const r = await gestor.enviar('d1', '573009876543', 'Hola');
    expect(r.ok).toBe(true);
    expect(f.ultimo().socket.enviados).toEqual([{ numero: '573009876543', texto: 'Hola' }]);
    await gestor.cerrar();
  });

  it('un número sin WhatsApp es un destino inválido (no se reintenta)', async () => {
    const { gestor, f } = await conectado();
    f.ultimo().socket.respuesta = 'SIN_WHATSAPP';
    const r = await gestor.enviar('d1', '573009876543', 'Hola');
    expect(!r.ok && r.error.codigoDeEnvio).toBe('DESTINO_INVALIDO');
    expect(!r.ok && r.error.transitorio).toBe(false);
    await gestor.cerrar();
  });

  it('un fallo al enviar es pasajero y no revela el contenido', async () => {
    const { gestor, f } = await conectado();
    f.ultimo().socket.respuesta = 'FALLA';
    const r = await gestor.enviar('d1', '573009876543', 'Hola');
    expect(!r.ok && r.error.codigoDeEnvio).toBe('FALLO_TEMPORAL');
    expect(!r.ok && r.error.detalleTecnico).not.toContain('número');
    await gestor.cerrar();
  });

  it('sin conexión no envía: canal no disponible (se reintenta)', async () => {
    const { gestor } = gestorDePrueba();
    const r = await gestor.enviar('d1', '573009876543', 'Hola');
    expect(!r.ok && r.error.codigoDeEnvio).toBe('CANAL_NO_DISPONIBLE');
    expect(!r.ok && r.error.transitorio).toBe(true);
  });

  it('manda de a uno y con pausa entre mensajes (6 por minuto = 10 s)', async () => {
    const { gestor, esperas } = await conectado({ mensajesPorMinuto: 6 });
    await Promise.all([
      gestor.enviar('d1', '573009876543', 'uno'),
      gestor.enviar('d1', '573009876543', 'dos'),
      gestor.enviar('d1', '573009876543', 'tres'),
    ]);
    // El primero sale sin esperar; los otros dos esperan ~10 s (más una pausa variable < 1 s).
    expect(esperas).toHaveLength(2);
    expect(esperas.every((ms) => ms > 9000 && ms < 11500)).toBe(true);
    await gestor.cerrar();
  });

  it('si WhatsApp cierra la sesión desde la cuenta, se borra todo y hay que vincular de nuevo', async () => {
    const { gestor, sesiones, f } = await conectado();
    f.ultimo().eventos.alCerrar({ cerradaPorLaCuenta: true, detalle: 'código 401' });
    await vi.waitFor(() => expect(sesiones.sesion().estado).toBe('SIN_VINCULAR'));
    expect(sesiones.datos()).toBeNull();
    expect(gestor.estaConectado('d1')).toBe(false);
    const r = await gestor.enviar('d1', '573009876543', 'Hola');
    expect(!r.ok && r.error.codigoDeEnvio).toBe('CANAL_NO_DISPONIBLE');
  });

  it('una caída pasajera guarda lo último, queda desconectado y reconecta sola con la sesión guardada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { gestor, sesiones, f } = gestorDePrueba();
    await gestor.vincular('d1');
    f.ultimo().eventos.alAbrir('573001234567');
    await vi.waitFor(() => expect(gestor.estaConectado('d1')).toBe(true));
    expect(f.creados).toHaveLength(1);

    f.ultimo().eventos.alCerrar({ cerradaPorLaCuenta: false, detalle: 'código 408' });
    await vi.waitFor(() => expect(sesiones.sesion().estado).toBe('DESCONECTADA'));
    expect(gestor.estaConectado('d1')).toBe(false);
    expect(sesiones.datos()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2500);
    await vi.waitFor(() => expect(f.creados).toHaveLength(2));
    // Reconecta con lo guardado, no con un QR nuevo.
    expect(f.ultimo().datos).toContain('secreto-de-la-sesion');
    await gestor.cerrar();
  });

  it('desvincular cierra la sesión en WhatsApp y borra lo guardado', async () => {
    const { gestor, sesiones, f } = await conectado();
    const socket = f.ultimo().socket;
    await gestor.desvincular('d1');
    expect(socket.sesionCerrada).toBe(true);
    expect(socket.cerrado).toBeGreaterThan(0);
    expect(sesiones.sesion().estado).toBe('SIN_VINCULAR');
    expect(sesiones.datos()).toBeNull();
    expect(gestor.estaConectado('d1')).toBe(false);
  });

  it('los eventos de un socket viejo ya olvidado se ignoran', async () => {
    const { gestor, sesiones, f } = await conectado();
    const viejo = f.ultimo().eventos;
    await gestor.desvincular('d1');
    viejo.alAbrir('573001234567');
    viejo.alQr('2@fantasma');
    await new Promise((r) => setTimeout(r, 20));
    expect(sesiones.sesion().estado).toBe('SIN_VINCULAR');
    expect(gestor.estaConectado('d1')).toBe(false);
  });

  it('al iniciar el worker reconecta las sesiones guardadas', async () => {
    const e = gestorDePrueba();
    e.sesiones.ponerDatos(cifrador.cifrar('{"creds":"guardada"}', contextoDeSesionWhatsapp('d1')));
    await e.gestor.iniciar();
    expect(e.f.creados).toHaveLength(1);
    expect(e.f.ultimo().datos).toBe('{"creds":"guardada"}');
    await e.gestor.cerrar();
  });

  it('una sesión que no se puede descifrar (otra clave) se descarta y hay que vincular de nuevo', async () => {
    const e = gestorDePrueba();
    e.sesiones.ponerDatos(
      cifrador.cifrar('{"creds":"x"}', contextoDeSesionWhatsapp('otro-despacho')),
    );
    await e.gestor.iniciar();
    expect(e.f.creados).toHaveLength(0);
    expect(e.sesiones.reinicios).toHaveLength(1);
  });
});

describe('notificador de WhatsApp', () => {
  const aviso: AvisoDeConsultaMasiva = {
    tipo: 'CONSULTA_MASIVA',
    destinatario: { nombre: 'Laura', email: 'l@d.test', numeroWhatsapp: '573001234567' },
    consultaId: 'c1',
    procesos: 3,
    listos: 3,
    conProblemas: 0,
    porConfirmar: 0,
    urlBase: 'https://luris.test',
  };

  it('envía el texto del aviso al número de la persona, por la sesión de su despacho', async () => {
    const llamadas: unknown[][] = [];
    const notificador = crearNotificadorDeWhatsapp({
      gestor: {
        enviar: async (...args: unknown[]) => {
          llamadas.push(args);
          return ok(undefined);
        },
      },
    });
    const r = await notificador.enviar(aviso, { despachoId: 'd1' });
    expect(r.ok).toBe(true);
    expect(llamadas[0]?.slice(0, 2)).toEqual(['d1', '573001234567']);
    expect(String(llamadas[0]?.[2])).toContain('terminó tu consulta masiva');
  });

  it('sin número no envía', async () => {
    const notificador = crearNotificadorDeWhatsapp({
      gestor: { enviar: async () => ok(undefined) },
    });
    const r = await notificador.enviar(
      { ...aviso, destinatario: { ...aviso.destinatario, numeroWhatsapp: null } },
      { despachoId: 'd1' },
    );
    expect(!r.ok && r.error.codigoDeEnvio).toBe('DESTINO_INVALIDO');
  });
});

// ─── Correo ───────────────────────────────────────────────────────────────────

const avisoDeActuaciones: AvisoDeActuaciones = {
  tipo: 'ACTUACIONES',
  destinatario: { nombre: 'Laura', email: 'laura@despacho.test', numeroWhatsapp: null },
  modo: 'INMEDIATA',
  urlBase: 'https://luris.test',
  procesos: [
    {
      procesoId: 'p1',
      alias: 'Ejecutivo <Bancolombia>',
      cliente: null,
      radicado: '50001400300120210034300',
      nunc: null,
      actuaciones: [
        {
          id: 'a1',
          plataforma: 'RAMA_CPNU',
          origen: 'TYBA',
          fechaActuacion: new Date('2026-11-13T00:00:00Z'),
          fechaRegistro: new Date('2026-11-14T00:00:00Z'),
          descripcion: 'Auto Fija Fecha Audiencia',
          anotacion: null,
          tieneDocumentos: true,
        },
      ],
    },
  ],
};

describe('correo de avisos (React Email)', () => {
  it('muestra el proceso, las dos fechas oficiales y el enlace, con el contenido escapado', async () => {
    const html = await renderizarAviso(avisoDeActuaciones);
    expect(html).toContain('Auto Fija Fecha Audiencia');
    expect(html).toContain('13/11/2026');
    expect(html).toContain('14/11/2026');
    expect(html).toContain('50001400300120210034300');
    expect(html).toContain('Tyba, vía la Rama Judicial');
    expect(html).toContain('Tiene documentos adjuntos');
    expect(html).toContain('https://luris.test/procesos/p1');
    expect(html).toContain('https://luris.test/notificaciones');
    // El alias del usuario no inyecta HTML.
    expect(html).not.toContain('<Bancolombia>');
    expect(html).toContain('&lt;Bancolombia&gt;');
  });

  it('el resumen diario y el aviso de la consulta masiva tienen su propio título', async () => {
    expect(await renderizarAviso({ ...avisoDeActuaciones, modo: 'RESUMEN_DIARIO' })).toContain(
      'Tu resumen diario',
    );
    const masiva = await renderizarAviso({
      tipo: 'CONSULTA_MASIVA',
      destinatario: avisoDeActuaciones.destinatario,
      consultaId: 'c1',
      procesos: 400,
      listos: 390,
      conProblemas: 10,
      porConfirmar: 0,
      urlBase: 'https://luris.test',
    });
    expect(masiva).toContain('Terminó tu consulta masiva');
    expect(masiva).toContain('https://luris.test/consulta-masiva/c1');
  });

  it('el notificador arma asunto, texto y HTML y los entrega al enviador', async () => {
    const enviados: Parameters<EnviadorDeCorreos['enviar']>[0][] = [];
    const notificador = crearNotificadorDeCorreo({
      enviador: {
        enviar: async (correo) => {
          enviados.push(correo);
          return ok(undefined);
        },
      },
    });
    const r = await notificador.enviar(avisoDeActuaciones, { despachoId: 'd1' });
    expect(r.ok).toBe(true);
    expect(enviados[0]).toMatchObject({
      para: 'laura@despacho.test',
      asunto: '1 actuación nueva en Ejecutivo <Bancolombia>',
    });
    expect(enviados[0]?.texto).toContain('Actuación: 13/11/2026 · Registro: 14/11/2026');
    expect(enviados[0]?.html).toContain('Auto Fija Fecha Audiencia');
  });

  it('un error del enviador sale como error de envío, pasajero si no se sabe', async () => {
    const con = (error: unknown) =>
      crearNotificadorDeCorreo({ enviador: { enviar: async () => err(error as never) } }).enviar(
        avisoDeActuaciones,
        { despachoId: 'd1' },
      );
    const definitivo = await con(new ErrorDeEnvio('DESTINO_INVALIDO'));
    expect(!definitivo.ok && definitivo.error.codigoDeEnvio).toBe('DESTINO_INVALIDO');
    const raro = await con(new ErrorInesperado(new Error('disco lleno')));
    expect(!raro.ok && raro.error.codigoDeEnvio).toBe('FALLO_TEMPORAL');
  });
});

describe('clasificación de fallos de SMTP', () => {
  it.each([
    [{ code: 'ECONNECTION' }, 'FALLO_TEMPORAL'],
    [{ code: 'ETIMEDOUT' }, 'FALLO_TEMPORAL'],
    [{ code: 'EAUTH', responseCode: 535 }, 'CANAL_NO_DISPONIBLE'],
    [{ code: 'EENVELOPE' }, 'DESTINO_INVALIDO'],
    [{ responseCode: 421 }, 'FALLO_TEMPORAL'],
    [{ responseCode: 450 }, 'FALLO_TEMPORAL'],
    [{ responseCode: 550 }, 'DESTINO_INVALIDO'],
    [{ responseCode: 553 }, 'DESTINO_INVALIDO'],
    [{ responseCode: 554 }, 'RECHAZADO'],
    [new Error('algo raro'), 'FALLO_TEMPORAL'],
    [undefined, 'FALLO_TEMPORAL'],
  ])('%j → %s', (causa, esperado) => {
    expect(clasificarFalloDeSmtp(causa)).toBe(esperado);
  });
});
