/**
 * Raíz de composición: el único lugar donde se conectan implementaciones concretas
 * (adaptadores) con los puertos que usan los casos de uso. Inyección manual, sin contenedor DI.
 *
 * Las capas de dominio y aplicación nunca importan este archivo; lo usan las fronteras
 * (páginas, server actions, route handlers, worker).
 */
import { crearRegistradorPrisma } from '@/modules/auditoria/infrastructure/registrador-prisma';
import {
  crearCambiarEstadoDeDespacho,
  crearCrearDespacho,
  crearListarDespachos,
} from '@/modules/despachos/application/administrar-despachos';
import { crearRepositorioDeDespachos } from '@/modules/despachos/infrastructure/repositorio-despachos-prisma';
import type { EnviadorDeCorreos } from '@/modules/notificaciones/domain/enviador-de-correos';
import { crearEnviadorEnArchivo } from '@/modules/notificaciones/infrastructure/email/enviador-en-archivo';
import {
  crearCambiarEstadoDeCuenta,
  crearCambiarRol,
  crearListarUsuariosDelDespacho,
} from '@/modules/usuarios/application/administrar-cuentas';
import { crearObtenerContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import { correoDeRecuperacion } from '@/modules/usuarios/application/correos';
import {
  crearAceptarInvitacion,
  crearCancelarInvitacion,
  crearConsultarInvitacion,
  crearInvitarUsuario,
  type DependenciasDeInvitaciones,
} from '@/modules/usuarios/application/invitaciones';
import type { LimitadorDeIntentos } from '@/modules/usuarios/application/puertos';
import {
  crearCerrarSesion,
  crearIniciarSesion,
  crearRestablecerContrasena,
  crearSolicitarRecuperacion,
} from '@/modules/usuarios/application/sesion';
import {
  crearBetterAuth,
  type InstanciaBetterAuth,
} from '@/modules/usuarios/infrastructure/autenticacion/better-auth';
import { crearServicioBetterAuth } from '@/modules/usuarios/infrastructure/autenticacion/servicio-better-auth';
import {
  crearRepositorioDeInvitaciones,
  crearRepositorioDeMembresias,
  crearRepositorioDeUsuarios,
} from '@/modules/usuarios/infrastructure/repositorios-prisma';
import {
  crearLimitadorEnMemoria,
  generadorDeTokens,
  relojDelSistema,
} from '@/modules/usuarios/infrastructure/utilidades';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/shared/domain/logger';
import { obtenerEnv, type Env } from '@/shared/infrastructure/env';
import { crearLoggerPino } from '@/shared/infrastructure/logger';
import {
  crearClienteDeDespacho,
  type ClienteDeDespacho,
} from '@/shared/infrastructure/prisma/aislamiento-despacho';
import { obtenerClientePrismaCompartido } from '@/shared/infrastructure/prisma/cliente';

export interface BaseDeDatos {
  /** Acceso a datos de negocio, siempre limitado al despacho de la sesión. */
  paraDespacho(despachoId: string): ClienteDeDespacho;
  /**
   * Acceso SIN filtro de despacho. Solo para autenticación, administración de despachos
   * (superadmin) y tareas de plataforma. Nunca para leer datos de procesos.
   */
  readonly sinAislamiento: PrismaClient;
}

export interface Dependencias {
  readonly env: Env;
  readonly logger: Logger;
  readonly baseDeDatos: BaseDeDatos;
}

type Servicio = 'web' | 'worker' | 'cli';

const dependenciasPorServicio = new Map<Servicio, Dependencias>();

export function obtenerDependencias(servicio: Servicio = 'web'): Dependencias {
  const existentes = dependenciasPorServicio.get(servicio);
  if (existentes) return existentes;

  const dependencias = construir(servicio);
  dependenciasPorServicio.set(servicio, dependencias);
  return dependencias;
}

function construir(servicio: Servicio): Dependencias {
  const env = obtenerEnv();
  const logger = crearLoggerPino({ nivel: env.LOG_LEVEL, formato: env.LOG_FORMAT, servicio });
  // El cliente no abre conexiones hasta la primera consulta.
  const prisma = obtenerClientePrismaCompartido(env.DATABASE_URL);

  return {
    env,
    logger,
    baseDeDatos: {
      paraDespacho: (despachoId) => crearClienteDeDespacho(prisma, despachoId),
      sinAislamiento: prisma,
    },
  };
}

// ─── Cuentas, sesiones y despachos (Fase 2) ───────────────────────────────────

interface Compartidos {
  readonly auth: InstanciaBetterAuth;
  readonly correos: EnviadorDeCorreos;
  readonly limitador: LimitadorDeIntentos;
}

let compartidos: Compartidos | undefined;

/** Piezas con estado que viven todo el proceso (instancia de Better Auth, limitador). */
function obtenerCompartidos(dependencias: Dependencias): Compartidos {
  if (compartidos) return compartidos;
  const { env, logger, baseDeDatos } = dependencias;
  const correos = crearEnviadorEnArchivo({
    directorio: env.CORREO_DIRECTORIO,
    remitente: env.CORREO_REMITENTE,
    logger,
  });
  const membresias = crearRepositorioDeMembresias(baseDeDatos);

  const auth = crearBetterAuth({
    prisma: baseDeDatos.sinAislamiento,
    secreto: env.BETTER_AUTH_SECRET,
    urlBase: env.APP_URL,
    minutosRecuperacion: env.RECUPERACION_MINUTOS_VIGENCIA,
    logger,
    despachoInicial: async (usuarioId) =>
      (await membresias.primerDespachoDisponible(usuarioId)).despachoId,
    enviarRecuperacion: async ({ email, nombre, token }) => {
      const envio = await correos.enviar(
        correoDeRecuperacion({
          para: email,
          nombre,
          url: `${env.APP_URL}/restablecer-contrasena/${token}`,
          minutosDeVigencia: env.RECUPERACION_MINUTOS_VIGENCIA,
        }),
      );
      if (!envio.ok)
        logger.error('No se pudo enviar el correo de recuperación', { error: envio.error });
    },
  });

  compartidos = {
    auth,
    correos,
    // 5 fallos por correo (o por IP) en 15 minutos bloquean el resto de la ventana.
    limitador: crearLimitadorEnMemoria({ maximoDeFallos: 5, ventanaMinutos: 15 }),
  };
  return compartidos;
}

/** Instancia de Better Auth (para la semilla y las pruebas). */
export function obtenerBetterAuth(): InstanciaBetterAuth {
  return obtenerCompartidos(obtenerDependencias('web')).auth;
}

/**
 * Casos de uso de la web. `cabeceras` da las cabeceras de la petición en curso (las pasa la
 * capa de presentación con `headers()` de Next.js); así este archivo no depende de Next.
 */
export function obtenerCasosDeUso(cabeceras: () => Promise<Headers>) {
  const dependencias = obtenerDependencias('web');
  const { env, logger, baseDeDatos } = dependencias;
  const { auth, correos, limitador } = obtenerCompartidos(dependencias);

  const autenticacion = crearServicioBetterAuth({
    auth,
    prisma: baseDeDatos.sinAislamiento,
    cabeceras,
    logger,
  });
  const usuarios = crearRepositorioDeUsuarios(baseDeDatos);
  const membresias = crearRepositorioDeMembresias(baseDeDatos);
  const invitaciones = crearRepositorioDeInvitaciones(baseDeDatos);
  const despachos = crearRepositorioDeDespachos(baseDeDatos.sinAislamiento);
  const auditoria = crearRegistradorPrisma({
    paraDespacho: baseDeDatos.paraDespacho,
    sinAislamiento: baseDeDatos.sinAislamiento,
    logger,
  });

  const depsDeInvitaciones: DependenciasDeInvitaciones = {
    invitaciones,
    membresias,
    usuarios,
    autenticacion,
    correos,
    tokens: generadorDeTokens,
    reloj: relojDelSistema,
    auditoria,
    urlBase: env.APP_URL,
    horasDeVigencia: env.INVITACION_HORAS_VIGENCIA,
  };
  const depsDeSesion = { autenticacion, usuarios, membresias, limitador, auditoria };
  const depsDeCuentas = { membresias, invitaciones, auditoria };

  return {
    obtenerContextoDeSesion: crearObtenerContextoDeSesion({ autenticacion, usuarios, membresias }),
    iniciarSesion: crearIniciarSesion(depsDeSesion),
    cerrarSesion: crearCerrarSesion(depsDeSesion),
    solicitarRecuperacion: crearSolicitarRecuperacion(depsDeSesion),
    restablecerContrasena: crearRestablecerContrasena(depsDeSesion),
    listarUsuariosDelDespacho: crearListarUsuariosDelDespacho(depsDeCuentas),
    cambiarRol: crearCambiarRol(depsDeCuentas),
    cambiarEstadoDeCuenta: crearCambiarEstadoDeCuenta(depsDeCuentas),
    invitarUsuario: crearInvitarUsuario(depsDeInvitaciones),
    cancelarInvitacion: crearCancelarInvitacion(depsDeInvitaciones),
    consultarInvitacion: crearConsultarInvitacion(depsDeInvitaciones),
    aceptarInvitacion: crearAceptarInvitacion(depsDeInvitaciones),
    listarDespachos: crearListarDespachos({ despachos }),
    crearDespacho: crearCrearDespacho({
      despachos,
      auditoria,
      invitaciones: depsDeInvitaciones,
    }),
    cambiarEstadoDeDespacho: crearCambiarEstadoDeDespacho({ despachos, auditoria }),
  };
}

export type CasosDeUso = ReturnType<typeof obtenerCasosDeUso>;
