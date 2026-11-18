import type * as Baileys from '@whiskeysockets/baileys';
import type { WAVersion } from '@whiskeysockets/baileys';
import type { Logger } from '@/shared/domain/logger';
import { numeroDeJid } from '../../domain/whatsapp';
import { crearEstadoDeAutenticacion } from './estado-de-autenticacion';
import type { FabricaDeSocket, SocketDeWhatsapp } from './gestor-de-whatsapp';

/** Adapta nuestro logger al que espera Baileys. Solo avisos y errores: lo demás es ruido. */
function loggerDeBaileys(logger: Logger) {
  const adaptado = {
    level: 'warn',
    child: () => adaptado,
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (objeto: unknown, mensaje?: string) =>
      logger.warn(mensaje ?? 'Baileys', { detalle: resumir(objeto) }),
    error: (objeto: unknown, mensaje?: string) =>
      logger.error(mensaje ?? 'Baileys', { detalle: resumir(objeto) }),
  };
  return adaptado;
}

/** Solo el mensaje del error: los objetos de Baileys pueden traer números y contenido de mensajes. */
function resumir(objeto: unknown): string {
  if (objeto instanceof Error) return objeto.message;
  if (typeof objeto === 'string') return objeto;
  return 'ver el código del evento';
}

function codigoDeDesconexion(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

/**
 * Fábrica de sockets de Baileys (librería de código abierto, NO la API oficial de Meta; ver las
 * advertencias de WhatsApp en Ajustes). Es el único archivo que conoce a Baileys.
 */
export function crearFabricaBaileys(opciones: { readonly logger: Logger }): FabricaDeSocket {
  const registro = loggerDeBaileys(opciones.logger);
  let versionDeWhatsapp: Promise<WAVersion | undefined> | null = null;

  /** La versión vigente del cliente de WhatsApp Web; si no se puede consultar, la de la librería. */
  function versionVigente(
    fetchLatestBaileysVersion: typeof Baileys.fetchLatestBaileysVersion,
  ): Promise<WAVersion | undefined> {
    versionDeWhatsapp ??= fetchLatestBaileysVersion({ signal: AbortSignal.timeout(8000) })
      .then((r) => r.version)
      .catch(() => undefined);
    return versionDeWhatsapp;
  }

  return {
    async crear(datos, eventos): Promise<SocketDeWhatsapp> {
      // Baileys se carga aquí, la primera vez que el worker lo necesita (nunca en la web).
      const baileys = await import('@whiskeysockets/baileys');
      const { Browsers, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } =
        baileys;
      const persistible = crearEstadoDeAutenticacion(datos, eventos.alCambiarCredenciales, baileys);
      const version = await versionVigente(fetchLatestBaileysVersion);
      const socket = baileys.makeWASocket({
        auth: {
          creds: persistible.estado.creds,
          keys: makeCacheableSignalKeyStore(persistible.estado.keys, registro),
        },
        ...(version && { version }),
        browser: Browsers.macOS('LURIS'),
        logger: registro,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
      });

      socket.ev.on('creds.update', eventos.alCambiarCredenciales);
      socket.ev.on('connection.update', (cambio) => {
        if (cambio.qr) eventos.alQr(cambio.qr);
        if (cambio.connection === 'open') {
          eventos.alAbrir(socket.user?.id ? numeroDeJid(socket.user.id) : null);
        }
        if (cambio.connection === 'close') {
          const codigo = codigoDeDesconexion(cambio.lastDisconnect?.error);
          eventos.alCerrar({
            // 401: el dispositivo se quitó desde el teléfono o WhatsApp cerró la sesión.
            cerradaPorLaCuenta: codigo === DisconnectReason.loggedOut,
            detalle: `código ${codigo ?? 'desconocido'}`,
          });
        }
      });

      return {
        async enviarTexto(numero, texto) {
          const existe = (await socket.onWhatsApp(numero))?.[0];
          if (!existe?.exists) return 'SIN_WHATSAPP';
          await socket.sendMessage(existe.jid, { text: texto });
          return 'ENVIADO';
        },
        cerrar() {
          socket.ev.removeAllListeners('connection.update');
          socket.ev.removeAllListeners('creds.update');
          void socket.end(undefined);
        },
        async cerrarSesion() {
          await socket.logout();
        },
        exportarDatos: () => persistible.exportar(),
      };
    },
  };
}
