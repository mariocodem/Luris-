import type { CifradorDeCredenciales } from '@/modules/plataformas/application/puertos';
import type { Logger } from '@/shared/domain/logger';
import { err, ok, type Result } from '@/shared/domain/result';
import type { Reloj, RepositorioDeSesionDeWhatsapp } from '../../application/puertos';
import { ErrorDeEnvio } from '../../domain/notificador';
import { contextoDeQrWhatsapp, contextoDeSesionWhatsapp } from '../../domain/whatsapp';

// ─── Lo que necesita el gestor de un socket de WhatsApp (lo implementa Baileys) ──

export interface EventosDelSocket {
  /** Llegó un QR nuevo para escanear. */
  alQr(qr: string): void;
  /** La conexión quedó abierta; `numero` es el número vinculado. */
  alAbrir(numero: string | null): void;
  /**
   * La conexión se cerró. `cerradaPorLaCuenta`: WhatsApp cerró la sesión (el dispositivo se quitó
   * desde el teléfono, la cuenta fue baneada…): las claves ya no sirven y hay que vincular de nuevo.
   * Si no, es una caída pasajera (red, reinicio tras escanear el QR): se reconecta sola.
   */
  alCerrar(motivo: { readonly cerradaPorLaCuenta: boolean; readonly detalle: string }): void;
  /** Cambiaron las credenciales o las claves: hay que guardarlas. */
  alCambiarCredenciales(): void;
}

export interface SocketDeWhatsapp {
  /** `SIN_WHATSAPP`: el número no tiene WhatsApp. */
  enviarTexto(numero: string, texto: string): Promise<'ENVIADO' | 'SIN_WHATSAPP'>;
  /** Cierra la conexión sin cerrar la sesión en WhatsApp (se podrá reconectar). */
  cerrar(): void;
  /** Cierra la sesión en WhatsApp: el dispositivo deja de estar vinculado. */
  cerrarSesion(): Promise<void>;
  /** Credenciales y claves como JSON, para guardarlas cifradas. */
  exportarDatos(): string;
}

export interface FabricaDeSocket {
  /** `datos`: lo guardado de una sesión anterior, o null para vincular un número nuevo (QR). */
  crear(datos: string | null, eventos: EventosDelSocket): Promise<SocketDeWhatsapp>;
}

// ─── Gestor ───────────────────────────────────────────────────────────────────

interface ConexionDelDespacho {
  socket: SocketDeWhatsapp | null;
  conectado: boolean;
  /** Se está vinculando un número nuevo (aún no se escaneó el QR). */
  vinculando: boolean;
  reconexiones: number;
  guardado: ReturnType<typeof setTimeout> | null;
  reconexion: ReturnType<typeof setTimeout> | null;
  vencimientoDelQr: ReturnType<typeof setTimeout> | null;
  /** Cadena de envíos: de a uno, con pausa entre mensajes. */
  cola: Promise<void>;
  ultimoEnvio: number;
}

const GUARDAR_CREDENCIALES_TRAS_MS = 1500;
const ESPERA_MAXIMA_DE_RECONEXION_MS = 5 * 60_000;
/** Si en este tiempo nadie escanea el QR, la vinculación se cancela. */
const MINUTOS_PARA_ESCANEAR = 3;

export interface OpcionesDelGestor {
  readonly sesiones: RepositorioDeSesionDeWhatsapp;
  readonly cifrador: CifradorDeCredenciales;
  readonly fabrica: FabricaDeSocket;
  readonly reloj: Reloj;
  readonly logger: Logger;
  /** Ritmo máximo de mensajes por despacho (§9: bajo, para no arriesgar el número). */
  readonly mensajesPorMinuto: number;
  /** Para pruebas: espera sin esperar de verdad. */
  readonly esperar?: (ms: number) => Promise<void>;
}

/**
 * Mantiene las sesiones de WhatsApp de los despachos dentro del proceso `worker` (§9, sin
 * contenedor adicional): vincula por QR, guarda la sesión cifrada, reconecta sola y envía los
 * mensajes de a uno y despacio. Todo lo de Baileys queda detrás de `FabricaDeSocket`: cambiar a la
 * API oficial de Meta (WhatsApp Cloud) es reemplazar este archivo y la fábrica, nada más.
 */
export function crearGestorDeWhatsapp(opciones: OpcionesDelGestor) {
  const { sesiones, cifrador, fabrica, reloj, logger } = opciones;
  const conexiones = new Map<string, ConexionDelDespacho>();
  const intervaloMs = Math.ceil(60_000 / opciones.mensajesPorMinuto);
  const esperar =
    opciones.esperar ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  let cerrado = false;

  function conexionDe(despachoId: string): ConexionDelDespacho {
    let conexion = conexiones.get(despachoId);
    if (!conexion) {
      conexion = {
        socket: null,
        conectado: false,
        vinculando: false,
        reconexiones: 0,
        guardado: null,
        reconexion: null,
        vencimientoDelQr: null,
        cola: Promise.resolve(),
        ultimoEnvio: 0,
      };
      conexiones.set(despachoId, conexion);
    }
    return conexion;
  }

  function limpiarTemporizadores(conexion: ConexionDelDespacho): void {
    for (const nombre of ['guardado', 'reconexion', 'vencimientoDelQr'] as const) {
      const t = conexion[nombre];
      if (t) clearTimeout(t);
      conexion[nombre] = null;
    }
  }

  async function guardarSesion(despachoId: string): Promise<void> {
    const socket = conexiones.get(despachoId)?.socket;
    if (!socket) return;
    try {
      await sesiones.guardarDatos(
        despachoId,
        cifrador.cifrar(socket.exportarDatos(), contextoDeSesionWhatsapp(despachoId)),
      );
    } catch (error) {
      logger.error('No se pudo guardar la sesión de WhatsApp', { despachoId, error });
    }
  }

  function programarGuardado(despachoId: string, conexion: ConexionDelDespacho): void {
    if (conexion.guardado) return;
    conexion.guardado = setTimeout(() => {
      conexion.guardado = null;
      void guardarSesion(despachoId);
    }, GUARDAR_CREDENCIALES_TRAS_MS);
  }

  async function olvidar(despachoId: string): Promise<void> {
    const conexion = conexiones.get(despachoId);
    if (conexion) {
      limpiarTemporizadores(conexion);
      conexion.socket?.cerrar();
      conexion.socket = null;
      conexion.conectado = false;
      conexion.vinculando = false;
    }
    conexiones.delete(despachoId);
    await sesiones.reiniciar(despachoId);
  }

  function programarReconexion(despachoId: string, conexion: ConexionDelDespacho): void {
    if (cerrado || conexion.reconexion) return;
    conexion.reconexiones += 1;
    const espera = Math.min(2 ** conexion.reconexiones * 1000, ESPERA_MAXIMA_DE_RECONEXION_MS);
    conexion.reconexion = setTimeout(() => {
      conexion.reconexion = null;
      void conectar(despachoId, false).catch((error: unknown) => {
        logger.error('No se pudo reconectar WhatsApp', { despachoId, error });
        programarReconexion(despachoId, conexion);
      });
    }, espera);
  }

  /** Abre el socket de un despacho: con la sesión guardada o, si `nueva`, para vincular por QR. */
  async function conectar(despachoId: string, nueva: boolean): Promise<void> {
    const conexion = conexionDe(despachoId);
    conexion.socket?.cerrar();
    conexion.socket = null;
    conexion.conectado = false;

    let datos: string | null = null;
    if (!nueva) {
      const guardados = await sesiones.cargarDatos(despachoId);
      if (!guardados) {
        // No hay sesión guardada: nada que reconectar.
        conexiones.delete(despachoId);
        return;
      }
      datos = cifrador.descifrar(guardados, contextoDeSesionWhatsapp(despachoId));
      if (datos === null) {
        // Otra clave de cifrado o datos alterados: la sesión no se puede usar.
        logger.error('No se pudo descifrar la sesión de WhatsApp: hay que vincular de nuevo', {
          despachoId,
        });
        await olvidar(despachoId);
        return;
      }
    }

    // Un socket viejo (ya olvidado o reemplazado) puede seguir emitiendo eventos: se ignoran.
    const vigente = (): boolean => conexiones.get(despachoId) === conexion;

    conexion.socket = await fabrica.crear(datos, {
      alQr: (qr) => {
        if (!vigente()) return;
        void sesiones
          .actualizar(despachoId, {
            estado: 'VINCULANDO',
            qr: cifrador.cifrar(qr, contextoDeQrWhatsapp(despachoId)),
            qrGeneradoEn: reloj.ahora(),
          })
          .catch((error: unknown) =>
            logger.error('No se pudo guardar el QR', { despachoId, error }),
          );
      },
      alAbrir: (numero) => {
        if (!vigente()) return;
        conexion.conectado = true;
        conexion.vinculando = false;
        conexion.reconexiones = 0;
        if (conexion.vencimientoDelQr) clearTimeout(conexion.vencimientoDelQr);
        conexion.vencimientoDelQr = null;
        void (async () => {
          await guardarSesion(despachoId);
          await sesiones.actualizar(despachoId, {
            estado: 'CONECTADA',
            numero,
            qr: null,
            qrGeneradoEn: null,
            vinculacionSolicitadaEn: null,
            conectadaEn: reloj.ahora(),
          });
          logger.info('WhatsApp conectado', { despachoId });
        })().catch((error: unknown) =>
          logger.error('No se pudo registrar la conexión de WhatsApp', { despachoId, error }),
        );
      },
      alCerrar: ({ cerradaPorLaCuenta, detalle }) => {
        if (!vigente()) return;
        conexion.conectado = false;
        logger.warn('WhatsApp se desconectó', { despachoId, cerradaPorLaCuenta, detalle });
        void (async () => {
          if (cerradaPorLaCuenta) {
            await olvidar(despachoId);
            return;
          }
          // Antes de reconectar se guarda lo último (al escanear el QR, WhatsApp pide reiniciar).
          await guardarSesion(despachoId);
          if (!conexion.vinculando)
            await sesiones.actualizar(despachoId, { estado: 'DESCONECTADA' });
          programarReconexion(despachoId, conexion);
        })().catch((error: unknown) =>
          logger.error('No se pudo atender la desconexión de WhatsApp', { despachoId, error }),
        );
      },
      alCambiarCredenciales: () => {
        if (vigente()) programarGuardado(despachoId, conexion);
      },
    });
  }

  return {
    /** Reconecta las sesiones guardadas (al iniciar el worker). */
    async iniciar(): Promise<void> {
      for (const despachoId of await sesiones.despachosConSesion()) {
        await conectar(despachoId, false).catch((error: unknown) => {
          logger.error('No se pudo reconectar WhatsApp al iniciar', { despachoId, error });
          programarReconexion(despachoId, conexionDe(despachoId));
        });
      }
    },

    /** Empieza a vincular un número nuevo: el QR queda en la sesión cifrada, para que la web lo muestre. */
    async vincular(despachoId: string): Promise<void> {
      const conexion = conexionDe(despachoId);
      limpiarTemporizadores(conexion);
      conexion.vinculando = true;
      conexion.reconexiones = 0;
      await sesiones.solicitarVinculacion(despachoId, reloj.ahora());
      await conectar(despachoId, true);
      // Si nadie escanea el QR a tiempo, se cancela (el QR de WhatsApp no dura para siempre).
      conexion.vencimientoDelQr = setTimeout(() => {
        conexion.vencimientoDelQr = null;
        if (conexion.conectado) return;
        logger.info('Vinculación de WhatsApp cancelada: nadie escaneó el QR', { despachoId });
        void olvidar(despachoId);
      }, MINUTOS_PARA_ESCANEAR * 60_000);
    },

    /** Cierra la sesión en WhatsApp y borra todo lo guardado. */
    async desvincular(despachoId: string): Promise<void> {
      const socket = conexiones.get(despachoId)?.socket;
      if (socket) {
        await socket.cerrarSesion().catch((error: unknown) => {
          logger.warn('WhatsApp no confirmó el cierre de sesión', { despachoId, error });
        });
      }
      await olvidar(despachoId);
    },

    /** Envía un texto por la sesión del despacho, de a uno y con pausa (§9). */
    async enviar(
      despachoId: string,
      numero: string,
      texto: string,
    ): Promise<Result<void, ErrorDeEnvio>> {
      const conexion = conexiones.get(despachoId);
      if (!conexion?.socket || !conexion.conectado) {
        return err(new ErrorDeEnvio('CANAL_NO_DISPONIBLE', 'WhatsApp sin conexión'));
      }
      const turno = conexion.cola.then(async () => {
        const falta = conexion.ultimoEnvio + intervaloMs - Date.now();
        // Pausa variable: un ritmo exacto se parece a un robot.
        if (falta > 0) await esperar(falta + Math.floor(Math.random() * 1000));
        conexion.ultimoEnvio = Date.now();
      });
      conexion.cola = turno.catch(() => undefined);
      await turno;
      // Durante la pausa la conexión pudo caerse o haberse reemplazado.
      const actual = conexiones.get(despachoId);
      if (!actual?.socket || !actual.conectado) {
        return err(new ErrorDeEnvio('CANAL_NO_DISPONIBLE', 'WhatsApp sin conexión'));
      }
      try {
        const resultado = await actual.socket.enviarTexto(numero, texto);
        return resultado === 'ENVIADO'
          ? ok(undefined)
          : err(new ErrorDeEnvio('DESTINO_INVALIDO', 'El número no tiene WhatsApp'));
      } catch (causa) {
        // Sin el texto del mensaje ni el número en el log.
        logger.warn('Falló el envío por WhatsApp', { despachoId, error: causa });
        return err(new ErrorDeEnvio('FALLO_TEMPORAL', 'Falló el envío por WhatsApp'));
      }
    },

    /** Estado de la conexión de un despacho (para pruebas y diagnóstico). */
    estaConectado(despachoId: string): boolean {
      return conexiones.get(despachoId)?.conectado ?? false;
    },

    /** Cierra todas las conexiones (sin cerrar las sesiones): al detener el worker. */
    async cerrar(): Promise<void> {
      cerrado = true;
      for (const [despachoId, conexion] of conexiones) {
        limpiarTemporizadores(conexion);
        await guardarSesion(despachoId);
        conexion.socket?.cerrar();
      }
      conexiones.clear();
    },
  };
}

export type GestorDeWhatsapp = ReturnType<typeof crearGestorDeWhatsapp>;
