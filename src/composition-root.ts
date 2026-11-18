/**
 * Raíz de composición: el único lugar donde se conectan implementaciones concretas
 * (adaptadores) con los puertos que usan los casos de uso. Inyección manual, sin contenedor DI.
 *
 * Las capas de dominio y aplicación nunca importan este archivo; lo usan las fronteras
 * (páginas, server actions, route handlers, worker).
 */
import type { PgBoss } from 'pg-boss';
import { crearRegistradorPrisma } from '@/modules/auditoria/infrastructure/registrador-prisma';
import {
  crearCambiarEstadoDeDespacho,
  crearCrearDespacho,
  crearListarDespachos,
} from '@/modules/despachos/application/administrar-despachos';
import { crearRepositorioDeDespachos } from '@/modules/despachos/infrastructure/repositorio-despachos-prisma';
import { crearAbrirDocumento } from '@/modules/documentos/application/abrir-documento';
import { crearAgregarDocumento } from '@/modules/documentos/application/agregar-documento';
import { crearObtenerDocumentos } from '@/modules/documentos/application/obtener-documentos';
import { crearAlmacenEnDisco } from '@/modules/documentos/infrastructure/almacen-en-disco';
import { crearRepositorioDeDocumentos } from '@/modules/documentos/infrastructure/repositorio-de-documentos-prisma';
import type { EnviadorDeCorreos } from '@/modules/notificaciones/domain/enviador-de-correos';
import {
  crearEliminarCredencial,
  crearGuardarCredencial,
  crearListarCredenciales,
  crearVerificarCredencial,
} from '@/modules/plataformas/application/credenciales';
import {
  crearCompletarIngreso,
  crearIngresarCodigoDeAcceso,
} from '@/modules/plataformas/application/codigo-de-acceso';
import type { CifradorDeCredenciales } from '@/modules/plataformas/application/puertos';
import { crearProveedorDeCuentas } from '@/modules/plataformas/application/proveedor-de-cuentas';
import {
  crearConfirmarConsultaAsistida,
  crearInterpretarConsultaAsistida,
  crearListarPendientes,
  crearPrepararConsultaAsistida,
} from '@/modules/plataformas/application/consulta-asistida';
import {
  crearIniciarConsultaMasiva,
  crearListarConsultasMasivas,
  crearObtenerConsultaMasiva,
  crearConsultarAvanceDeConsultaMasiva,
  crearPrepararExportacionDeConsultaMasiva,
  crearPrevisualizarConsultaMasiva,
  crearRegistrarResultadoDeConsultaMasiva,
  crearReintentarConsultaMasiva,
} from '@/modules/plataformas/application/consulta-masiva';
import {
  crearProgramarSincronizacion,
  type PlataformaAsistida,
} from '@/modules/plataformas/application/programar-sincronizacion';
import { crearSincronizarProceso } from '@/modules/plataformas/application/sincronizar-proceso';
import {
  crearConsultarAvance,
  crearSolicitarConsulta,
  type PlataformaAutomatica,
} from '@/modules/plataformas/application/solicitar-consulta';
import {
  esDeLaEspecialidadLaboral,
  esDeLoContenciosoAdministrativo,
} from '@/modules/plataformas/domain/jurisdiccion';
import type { CodigoPlataforma } from '@/modules/plataformas/domain/plataforma';
import type {
  CompletadorDeIngreso,
  DescargadorDeDocumentos,
  LectorDeConsultaAsistida,
  PlataformaJudicial,
  VerificadorDeAcceso,
} from '@/modules/plataformas/domain/puertos';
import {
  asegurarColas,
  crearColaDeTrabajos,
} from '@/modules/plataformas/infrastructure/cola-pg-boss';
import { crearClienteHttp } from '@/modules/plataformas/infrastructure/http/cliente-http';
import { crearLimitadorDeRitmo } from '@/modules/plataformas/infrastructure/http/limitador-de-ritmo';
import { crearSesionWeb } from '@/modules/plataformas/infrastructure/http/sesion-web';
import { crearPlataformaCpnu } from '@/modules/plataformas/infrastructure/rama-cpnu/adaptador-cpnu';
import { crearDescargadorCpnu } from '@/modules/plataformas/infrastructure/rama-cpnu/descargador-cpnu';
import { crearRepositorioDeCredenciales } from '@/modules/plataformas/infrastructure/repositorio-de-credenciales-prisma';
import { crearRepositorioDeConsultasMasivas } from '@/modules/plataformas/infrastructure/repositorio-de-consultas-masivas-prisma';
import { crearRepositorioDePendientes } from '@/modules/plataformas/infrastructure/repositorio-de-pendientes-prisma';
import { crearPlataformaSamai } from '@/modules/plataformas/infrastructure/samai/adaptador-samai';
import { crearVerificadorSamai } from '@/modules/plataformas/infrastructure/samai/verificador-samai';
import { crearRepositorioDeSincronizacion } from '@/modules/plataformas/infrastructure/repositorio-de-sincronizacion-prisma';
import { crearPlataformaSpoaOficial } from '@/modules/plataformas/infrastructure/spoa/adaptador-spoa-oficial';
import { crearLectorSpoa } from '@/modules/plataformas/infrastructure/spoa/lector-de-texto-spoa';
import { crearAdaptadorSiugj } from '@/modules/plataformas/infrastructure/siugj/adaptador-siugj';
import { crearNavegador } from '@/modules/plataformas/infrastructure/siugj/navegador';
import { crearCambiarEstadoDeProceso } from '@/modules/procesos/application/archivar-proceso';
import {
  crearAgregarAsignado,
  crearAsignarResponsable,
  crearQuitarAsignado,
} from '@/modules/procesos/application/asignaciones';
import { crearConsultarProceso } from '@/modules/procesos/application/consultar-proceso';
import { crearEditarProceso } from '@/modules/procesos/application/editar-proceso';
import {
  crearImportarProcesos,
  crearPrevisualizarImportacion,
} from '@/modules/procesos/application/importar-procesos';
import {
  crearListarProcesos,
  crearObtenerOpcionesDeProcesos,
} from '@/modules/procesos/application/listar-procesos';
import { crearRegistrarProceso } from '@/modules/procesos/application/registrar-proceso';
import { lectorDeTablas } from '@/modules/procesos/infrastructure/lector-de-tablas';
import {
  crearDirectorioDelDespacho,
  crearRepositorioDeProcesos,
} from '@/modules/procesos/infrastructure/repositorio-de-procesos-prisma';
import { crearEnviadorEnArchivo } from '@/modules/notificaciones/infrastructure/email/enviador-en-archivo';
import { crearEnviadorSmtp } from '@/modules/notificaciones/infrastructure/email/enviador-smtp';
import { crearNotificadorDeCorreo } from '@/modules/notificaciones/infrastructure/email/notificador-de-correo';
import { crearDespacharNotificaciones } from '@/modules/notificaciones/application/despachar-notificaciones';
import {
  crearGuardarPreferencias,
  crearListarNotificaciones,
  crearObtenerPreferencias,
} from '@/modules/notificaciones/application/preferencias';
import { crearProgramarNotificaciones } from '@/modules/notificaciones/application/programar-notificaciones';
import {
  crearDesvincularWhatsapp,
  crearObtenerEstadoDeWhatsapp,
  crearVincularWhatsapp,
} from '@/modules/notificaciones/application/whatsapp';
import type { Notificador } from '@/modules/notificaciones/domain/notificador';
import type { CanalDeAviso } from '@/modules/notificaciones/domain/aviso';
import {
  asegurarColasDeNotificaciones,
  crearColaDeWhatsapp,
  crearDespertadorDeNotificaciones,
} from '@/modules/notificaciones/infrastructure/cola-pg-boss';
import { crearRepositorioDeNotificaciones } from '@/modules/notificaciones/infrastructure/repositorio-de-notificaciones-prisma';
import { crearRepositorioDeSesionDeWhatsapp } from '@/modules/notificaciones/infrastructure/repositorio-de-sesion-whatsapp-prisma';
import { crearGestorDeWhatsapp } from '@/modules/notificaciones/infrastructure/whatsapp/gestor-de-whatsapp';
import { crearNotificadorDeWhatsapp } from '@/modules/notificaciones/infrastructure/whatsapp/notificador-de-whatsapp';
import { crearFabricaBaileys } from '@/modules/notificaciones/infrastructure/whatsapp/socket-baileys';
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
import { crearPgBoss, obtenerColaDeLaWeb } from '@/shared/infrastructure/cola/pg-boss';
import { crearCifradorAesGcm, leerClave } from '@/shared/infrastructure/crypto/cifrador-aes-gcm';
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
  /** Cupos de acciones costosas o sensibles, por persona o despacho (Fase 12). */
  readonly cupos: {
    readonly consultaMasiva: LimitadorDeIntentos;
    readonly credenciales: LimitadorDeIntentos;
    readonly whatsapp: LimitadorDeIntentos;
  };
}

let compartidos: Compartidos | undefined;

/** Piezas con estado que viven todo el proceso (instancia de Better Auth, limitador). */
function obtenerCompartidos(dependencias: Dependencias): Compartidos {
  if (compartidos) return compartidos;
  const { env, logger, baseDeDatos } = dependencias;
  const correos = crearEnviadorDeCorreos(env, logger);
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
    cupos: {
      // 10 consultas masivas cada 15 minutos por persona (un lote ya son hasta 400 procesos).
      consultaMasiva: crearLimitadorEnMemoria({ maximoDeFallos: 10, ventanaMinutos: 15 }),
      // 10 credenciales guardadas cada 15 minutos: cada una hace un ingreso real a la plataforma.
      credenciales: crearLimitadorEnMemoria({ maximoDeFallos: 10, ventanaMinutos: 15 }),
      // 5 vinculaciones de WhatsApp cada 15 minutos por despacho.
      whatsapp: crearLimitadorEnMemoria({ maximoDeFallos: 5, ventanaMinutos: 15 }),
    },
  };
  return compartidos;
}

/** Correos de salida: SMTP en producción; en desarrollo, archivos .html para abrirlos en el navegador. */
function crearEnviadorDeCorreos(env: Env, logger: Logger): EnviadorDeCorreos {
  if (env.CORREO_TRANSPORTE === 'smtp' && env.SMTP_HOST) {
    return crearEnviadorSmtp({
      host: env.SMTP_HOST,
      puerto: env.SMTP_PUERTO,
      seguro: env.SMTP_SEGURO ?? env.SMTP_PUERTO === 465,
      ...(env.SMTP_USUARIO &&
        env.SMTP_CLAVE && { usuario: env.SMTP_USUARIO, clave: env.SMTP_CLAVE }),
      remitente: env.CORREO_REMITENTE,
      logger,
    });
  }
  return crearEnviadorEnArchivo({
    directorio: env.CORREO_DIRECTORIO,
    remitente: env.CORREO_REMITENTE,
    logger,
  });
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
  const { auth, correos, limitador, cupos } = obtenerCompartidos(dependencias);

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

  // Procesos (Fase 4): todo pasa por el cliente aislado del despacho de la sesión.
  const procesos = crearRepositorioDeProcesos(baseDeDatos.paraDespacho);
  const directorio = crearDirectorioDelDespacho(baseDeDatos.paraDespacho);
  const depsDeProcesos = { procesos, directorio, auditoria };

  // Consultas a plataformas (Fases 5 y 6): la web solo encola; el worker consulta. Las
  // consultas asistidas (SPOA) las confirma la persona y se guardan desde la web.
  const catalogo = catalogoDePlataformas(env);
  const bossDeLaWeb = () =>
    obtenerColaDeLaWeb(
      () => crearPgBoss({ urlBaseDeDatos: env.DATABASE_URL, rol: 'web', logger }),
      async (boss) => {
        await asegurarColas(boss, catalogo.colas);
        await asegurarColasDeNotificaciones(boss);
      },
    );
  const cola = crearColaDeTrabajos(bossDeLaWeb);
  const depsDeConsulta = { procesos, cola, automaticas: catalogo.automaticas };
  const pendientes = crearRepositorioDePendientes(baseDeDatos.paraDespacho);
  const depsDeCredenciales = {
    limitador: cupos.credenciales,
    credenciales: crearRepositorioDeCredenciales(baseDeDatos.paraDespacho),
    cifrador: crearCifrador(env),
    cola,
    auditoria,
    reloj: relojDelSistema,
  };
  const masivas = crearRepositorioDeConsultasMasivas(baseDeDatos.paraDespacho);
  const depsDeMasiva = {
    limitador: cupos.consultaMasiva,
    masivas,
    procesos,
    pendientes,
    cola,
    lector: lectorDeTablas,
    automaticas: catalogo.automaticas,
    asistidas: catalogo.asistidas,
    auditoria,
    reloj: relojDelSistema,
  };
  // Notificaciones (Fase 11): la web guarda las preferencias y pide al worker vincular WhatsApp;
  // las consultas asistidas que guarda la web también programan sus avisos.
  const notificaciones = crearRepositorioDeNotificaciones(baseDeDatos.paraDespacho);
  const depsDeWhatsapp = {
    limitador: cupos.whatsapp,
    sesiones: crearRepositorioDeSesionDeWhatsapp(baseDeDatos),
    cola: crearColaDeWhatsapp(bossDeLaWeb),
    cifrador: crearCifrador(env),
    auditoria,
    reloj: relojDelSistema,
  };
  const programarNotificaciones = crearProgramarNotificaciones({
    repositorio: notificaciones,
    reloj: relojDelSistema,
    horaDelResumen: env.NOTIFICACIONES_HORA_RESUMEN,
    logger,
  });
  const despertador = crearDespertadorDeNotificaciones(bossDeLaWeb);
  const depsDeAsistida = {
    notificaciones: {
      async programar(datos: {
        despachoId: string;
        procesoId: string;
        actuacionIds: readonly string[];
      }) {
        const creadas = await programarNotificaciones(datos);
        if (creadas > 0) await despertador.despertar().catch(() => undefined);
        return creadas;
      },
    },
    masivas,
    procesos,
    lectores: catalogo.lectores,
    pendientes,
    auditoria,
    repositorio: crearRepositorioDeSincronizacion(baseDeDatos),
    cola,
    conDocumentos: catalogo.conDocumentos,
    reloj: relojDelSistema,
    logger,
  };

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
    listarProcesos: crearListarProcesos({ procesos }),
    obtenerOpcionesDeProcesos: crearObtenerOpcionesDeProcesos({ directorio }),
    consultarProceso: crearConsultarProceso({ procesos }),
    registrarProceso: crearRegistrarProceso(depsDeProcesos),
    editarProceso: crearEditarProceso(depsDeProcesos),
    cambiarEstadoDeProceso: crearCambiarEstadoDeProceso(depsDeProcesos),
    asignarResponsable: crearAsignarResponsable(depsDeProcesos),
    agregarAsignado: crearAgregarAsignado(depsDeProcesos),
    quitarAsignado: crearQuitarAsignado(depsDeProcesos),
    previsualizarImportacion: crearPrevisualizarImportacion({ procesos, lector: lectorDeTablas }),
    importarProcesos: crearImportarProcesos({ procesos, auditoria }),
    solicitarConsulta: crearSolicitarConsulta(depsDeConsulta),
    consultarAvance: crearConsultarAvance(depsDeConsulta),
    prepararConsultaAsistida: crearPrepararConsultaAsistida(depsDeAsistida),
    interpretarConsultaAsistida: crearInterpretarConsultaAsistida(depsDeAsistida),
    confirmarConsultaAsistida: crearConfirmarConsultaAsistida(depsDeAsistida),
    listarPendientes: crearListarPendientes({ pendientes }),
    obtenerPreferenciasDeNotificacion: crearObtenerPreferencias({ repositorio: notificaciones }),
    guardarPreferenciasDeNotificacion: crearGuardarPreferencias({
      repositorio: notificaciones,
      auditoria,
      reloj: relojDelSistema,
    }),
    listarNotificaciones: crearListarNotificaciones({ repositorio: notificaciones }),
    obtenerEstadoDeWhatsapp: crearObtenerEstadoDeWhatsapp(depsDeWhatsapp),
    vincularWhatsapp: crearVincularWhatsapp(depsDeWhatsapp),
    desvincularWhatsapp: crearDesvincularWhatsapp(depsDeWhatsapp),
    previsualizarConsultaMasiva: crearPrevisualizarConsultaMasiva(depsDeMasiva),
    iniciarConsultaMasiva: crearIniciarConsultaMasiva(depsDeMasiva),
    listarConsultasMasivas: crearListarConsultasMasivas(depsDeMasiva),
    obtenerConsultaMasiva: crearObtenerConsultaMasiva(depsDeMasiva),
    consultarAvanceDeConsultaMasiva: crearConsultarAvanceDeConsultaMasiva(depsDeMasiva),
    reintentarConsultaMasiva: crearReintentarConsultaMasiva(depsDeMasiva),
    prepararExportacionDeConsultaMasiva: crearPrepararExportacionDeConsultaMasiva(depsDeMasiva),
    listarCredenciales: crearListarCredenciales(depsDeCredenciales),
    guardarCredencial: crearGuardarCredencial(depsDeCredenciales),
    eliminarCredencial: crearEliminarCredencial(depsDeCredenciales),
    ingresarCodigoDeAcceso: crearIngresarCodigoDeAcceso({
      ...depsDeCredenciales,
      minutosParaCodigo: env.SIUGJ_MINUTOS_PARA_CODIGO,
    }),
    /** Minutos que se espera el código de acceso (para mostrar si sigue vigente). */
    minutosParaCodigoDeAcceso: env.SIUGJ_MINUTOS_PARA_CODIGO,
    /** Sin clave de cifrado, LURIS no acepta credenciales (se explica en Ajustes → Plataformas). */
    cifradoDeCredencialesConfigurado: depsDeCredenciales.cifrador !== null,
    agregarDocumento: crearAgregarDocumento({
      procesos,
      documentos: crearRepositorioDeDocumentos(baseDeDatos.paraDespacho),
      almacen: crearAlmacenEnDisco({ directorio: env.ALMACEN_DIRECTORIO }),
      auditoria,
      reloj: relojDelSistema,
      tamanoMaximoBytes: env.DOCUMENTO_TAMANO_MAXIMO_MB * 1024 * 1024,
    }),
    /** Qué plataformas se consultan solas y cuáles con la confirmación de la persona. */
    catalogoDePlataformas: { automaticas: catalogo.automaticas, asistidas: catalogo.asistidas },
    abrirDocumento: crearAbrirDocumento({
      procesos,
      documentos: crearRepositorioDeDocumentos(baseDeDatos.paraDespacho),
      almacen: crearAlmacenEnDisco({ directorio: env.ALMACEN_DIRECTORIO }),
    }),
  };
}

export type CasosDeUso = ReturnType<typeof obtenerCasosDeUso>;

// ─── Plataformas judiciales (Fases 5 y 6) ─────────────────────────────────────

/** El SPOA se consulta solo únicamente con el servicio oficial de la Fiscalía configurado. */
function spoaOficialConfigurado(env: Env): env is Env & {
  SPOA_INTEROPERABILIDAD_URL: string;
  SPOA_INTEROPERABILIDAD_TOKEN: string;
} {
  return (
    env.SPOA_INTEROPERABILIDAD_URL !== undefined && env.SPOA_INTEROPERABILIDAD_TOKEN !== undefined
  );
}

/**
 * Qué plataformas consulta LURIS sola y cuáles con la confirmación de la persona, en el orden de
 * prioridad del §1. Agregar una plataforma es agregar su adaptador aquí y en
 * `construirPlataformas` (O de SOLID): los casos de uso no cambian.
 */
function catalogoDePlataformas(env: Env) {
  const spoaAutomatico = spoaOficialConfigurado(env);
  const automaticas: PlataformaAutomatica[] = [{ codigo: 'RAMA_CPNU', identificador: 'RADICADO' }];
  // SAMAI solo para los procesos de lo contencioso administrativo (sus actuaciones llegan por la CPNU).
  const asistidas: PlataformaAsistida[] = [];
  const lectores = new Map<CodigoPlataforma, LectorDeConsultaAsistida>();
  if (spoaAutomatico) {
    automaticas.splice(1, 0, { codigo: 'SPOA', identificador: 'NUNC' });
  } else {
    asistidas.push({ codigo: 'SPOA', identificador: 'NUNC' });
    lectores.set('SPOA', crearLectorSpoa({ urlDelPortal: env.SPOA_URL_PORTAL }));
  }
  automaticas.push({
    codigo: 'SAMAI',
    identificador: 'RADICADO',
    aplica: esDeLoContenciosoAdministrativo,
  });
  // SIUGJ, con la cuenta del abogado o del despacho, para los procesos de la especialidad laboral.
  automaticas.push({
    codigo: 'SIUGJ',
    identificador: 'RADICADO',
    aplica: esDeLaEspecialidadLaboral,
  });
  const conDocumentos = new Set<CodigoPlataforma>(['RAMA_CPNU', 'SIUGJ']);
  return {
    automaticas,
    asistidas,
    lectores,
    conDocumentos,
    /** Una cola de sincronización por plataforma automática y una de documentos si los da. */
    colas: {
      sincronizables: automaticas.map((p) => p.codigo),
      conDocumentos: [...conDocumentos],
    },
  };
}

/** Cifrador de credenciales, o null si el servidor no tiene CREDENCIALES_CLAVE. */
function crearCifrador(env: Env): CifradorDeCredenciales | null {
  const clave = env.CREDENCIALES_CLAVE ? leerClave(env.CREDENCIALES_CLAVE) : null;
  return clave ? crearCifradorAesGcm({ claves: new Map([[1, clave]]), versionActual: 1 }) : null;
}

interface Plataformas {
  readonly consultas: ReadonlyMap<CodigoPlataforma, PlataformaJudicial>;
  readonly verificadores: ReadonlyMap<CodigoPlataforma, VerificadorDeAcceso>;
  readonly descargadores: ReadonlyMap<CodigoPlataforma, DescargadorDeDocumentos>;
  readonly completadores: ReadonlyMap<CodigoPlataforma, CompletadorDeIngreso>;
  /** Libera lo que tenga abierto (el navegador de SIUGJ) al detener el worker. */
  cerrar(): Promise<void>;
  /** Procesos que el worker consulta a la vez en cada plataforma. */
  readonly concurrencia: ReadonlyMap<CodigoPlataforma, number>;
}

function construirPlataformas({ env, logger, baseDeDatos }: Dependencias): Plataformas {
  const comunes = {
    userAgent: env.PLATAFORMAS_USER_AGENT,
    tiempoLimiteMs: env.PLATAFORMAS_TIEMPO_LIMITE_SEGUNDOS * 1000,
    reintentos: env.PLATAFORMAS_REINTENTOS,
    esperaBaseMs: 1000,
    pausaPorBloqueoMs: env.CPNU_PAUSA_POR_BLOQUEO_MINUTOS * 60_000,
    logger,
  };
  // Un limitador por plataforma: consultas y documentos de la CPNU comparten el mismo ritmo.
  const httpCpnu = crearClienteHttp({
    ...comunes,
    limitador: crearLimitadorDeRitmo({ solicitudesPorMinuto: env.CPNU_SOLICITUDES_POR_MINUTO }),
  });
  const cpnu = { urlBase: env.CPNU_URL_BASE, http: httpCpnu, logger };
  const consultas = new Map<CodigoPlataforma, PlataformaJudicial>([
    ['RAMA_CPNU', crearPlataformaCpnu(cpnu)],
  ]);
  const concurrencia = new Map<CodigoPlataforma, number>([['RAMA_CPNU', env.CPNU_CONCURRENCIA]]);

  // SAMAI: búsqueda pública y prueba de acceso de las credenciales comparten el mismo ritmo.
  const limitadorSamai = crearLimitadorDeRitmo({
    solicitudesPorMinuto: env.SAMAI_SOLICITUDES_POR_MINUTO,
  });
  consultas.set(
    'SAMAI',
    crearPlataformaSamai({
      urlBase: env.SAMAI_URL_BASE,
      http: crearClienteHttp({ ...comunes, limitador: limitadorSamai }),
      logger,
    }),
  );
  concurrencia.set('SAMAI', 1);
  const verificadores = new Map<CodigoPlataforma, VerificadorDeAcceso>([
    [
      'SAMAI',
      crearVerificadorSamai({
        urlBase: env.SAMAI_URL_BASE,
        crearSesion: () =>
          crearSesionWeb({
            userAgent: env.PLATAFORMAS_USER_AGENT,
            tiempoLimiteMs: comunes.tiempoLimiteMs,
            limitador: limitadorSamai,
          }),
      }),
    ],
  ]);

  if (spoaOficialConfigurado(env)) {
    const httpSpoa = crearClienteHttp({
      ...comunes,
      cabeceras: { Authorization: `Bearer ${env.SPOA_INTEROPERABILIDAD_TOKEN}` },
      limitador: crearLimitadorDeRitmo({ solicitudesPorMinuto: env.SPOA_SOLICITUDES_POR_MINUTO }),
    });
    consultas.set(
      'SPOA',
      crearPlataformaSpoaOficial({
        urlServicio: env.SPOA_INTEROPERABILIDAD_URL,
        http: httpSpoa,
        logger,
      }),
    );
    concurrencia.set('SPOA', 1);
  }

  // SIUGJ: navegador automatizado con la cuenta del proceso. Un ingreso a la vez (concurrencia 1),
  // que además mantiene en memoria los ingresos que esperan el código de acceso.
  const siugj = crearAdaptadorSiugj({
    urlBase: env.SIUGJ_URL_BASE,
    navegador: crearNavegador({
      canal: env.SIUGJ_NAVEGADOR,
      userAgent: env.PLATAFORMAS_USER_AGENT,
      logger,
    }),
    cuentas: crearProveedorDeCuentas({
      credenciales: crearRepositorioDeCredenciales(baseDeDatos.paraDespacho),
      cifrador: crearCifrador(env),
      reloj: { ahora: () => new Date() },
      minutosParaCodigo: env.SIUGJ_MINUTOS_PARA_CODIGO,
      logger,
    }),
    limitador: crearLimitadorDeRitmo({ solicitudesPorMinuto: env.SIUGJ_SOLICITUDES_POR_MINUTO }),
    tiempoLimiteMs: comunes.tiempoLimiteMs,
    minutosParaCodigo: env.SIUGJ_MINUTOS_PARA_CODIGO,
    logger,
  });
  consultas.set('SIUGJ', siugj);
  concurrencia.set('SIUGJ', 1);
  verificadores.set('SIUGJ', siugj);

  return {
    consultas,
    verificadores,
    descargadores: new Map<CodigoPlataforma, DescargadorDeDocumentos>([
      ['RAMA_CPNU', crearDescargadorCpnu(cpnu)],
      ['SIUGJ', siugj],
    ]),
    completadores: new Map<CodigoPlataforma, CompletadorDeIngreso>([['SIUGJ', siugj]]),
    concurrencia,
    cerrar: () => siugj.cerrar(),
  };
}

/** Servicios del worker: ejecutan los trabajos de la cola. */
export function obtenerServiciosDelWorker(boss: PgBoss) {
  const dependencias = obtenerDependencias('worker');
  const { env, logger, baseDeDatos } = dependencias;
  const catalogo = catalogoDePlataformas(env);
  const plataformas = construirPlataformas(dependencias);
  const cola = crearColaDeTrabajos(() => Promise.resolve(boss));
  const repositorio = crearRepositorioDeSincronizacion(baseDeDatos);
  const reloj = { ahora: () => new Date() };

  // Notificaciones (Fase 11): correo (SMTP) y WhatsApp (Baileys, dentro de este proceso).
  const notificaciones = crearRepositorioDeNotificaciones(baseDeDatos.paraDespacho);
  const despertador = crearDespertadorDeNotificaciones(() => Promise.resolve(boss));
  const programarNotificaciones = crearProgramarNotificaciones({
    repositorio: notificaciones,
    reloj,
    horaDelResumen: env.NOTIFICACIONES_HORA_RESUMEN,
    logger,
  });
  const cifradorDeSesiones = crearCifrador(env);
  const gestorDeWhatsapp = cifradorDeSesiones
    ? crearGestorDeWhatsapp({
        sesiones: crearRepositorioDeSesionDeWhatsapp(baseDeDatos),
        cifrador: cifradorDeSesiones,
        fabrica: crearFabricaBaileys({ logger }),
        reloj,
        logger,
        mensajesPorMinuto: env.WHATSAPP_MENSAJES_POR_MINUTO,
      })
    : null;
  const notificadores = new Map<CanalDeAviso, Notificador>([
    ['CORREO', crearNotificadorDeCorreo({ enviador: crearEnviadorDeCorreos(env, logger) })],
  ]);
  if (gestorDeWhatsapp) {
    notificadores.set('WHATSAPP', crearNotificadorDeWhatsapp({ gestor: gestorDeWhatsapp }));
  }

  return {
    colas: catalogo.colas,
    concurrencia: plataformas.concurrencia,
    sincronizarProceso: crearSincronizarProceso({
      plataformas: plataformas.consultas,
      conDocumentos: catalogo.conDocumentos,
      repositorio,
      cola,
      reloj,
      logger,
      notificaciones: {
        async programar(datos) {
          const creadas = await programarNotificaciones(datos);
          if (creadas > 0) await despertador.despertar().catch(() => undefined);
          return creadas;
        },
      },
    }),
    despacharNotificaciones: crearDespacharNotificaciones({
      repositorio: notificaciones,
      notificadores,
      despachosActivos: () => repositorio.despachosActivos(),
      urlBase: env.APP_URL,
      reloj,
      logger,
    }),
    /** Null si el servidor no tiene CREDENCIALES_CLAVE: sin ella no se guarda ninguna sesión de WhatsApp. */
    gestorDeWhatsapp,
    obtenerDocumentos: crearObtenerDocumentos({
      descargadores: plataformas.descargadores,
      documentos: crearRepositorioDeDocumentos(baseDeDatos.paraDespacho),
      almacen: crearAlmacenEnDisco({ directorio: env.ALMACEN_DIRECTORIO }),
      reloj,
      tamanoMaximoBytes: env.DOCUMENTO_TAMANO_MAXIMO_MB * 1024 * 1024,
      logger,
    }),
    verificarCredencial: crearVerificarCredencial({
      credenciales: crearRepositorioDeCredenciales(baseDeDatos.paraDespacho),
      cifrador: crearCifrador(env),
      verificadores: plataformas.verificadores,
      reloj,
      logger,
    }),
    completarIngreso: crearCompletarIngreso({
      credenciales: crearRepositorioDeCredenciales(baseDeDatos.paraDespacho),
      cifrador: crearCifrador(env),
      completadores: plataformas.completadores,
      sincronizacion: repositorio,
      automaticas: catalogo.automaticas,
      cola,
      reloj,
      logger,
    }),
    registrarResultadoDeConsultaMasiva: crearRegistrarResultadoDeConsultaMasiva({
      masivas: crearRepositorioDeConsultasMasivas(baseDeDatos.paraDespacho),
      reloj,
    }),
    cerrarPlataformas: async () => {
      await gestorDeWhatsapp?.cerrar();
      await plataformas.cerrar();
    },
    programarSincronizacion: crearProgramarSincronizacion({
      repositorio,
      cola,
      automaticas: catalogo.automaticas,
      asistidas: catalogo.asistidas,
      pendientes: crearRepositorioDePendientes(baseDeDatos.paraDespacho),
      diasEntreConfirmaciones: env.SPOA_DIAS_ENTRE_CONFIRMACIONES,
      reloj,
      logger,
    }),
  };
}

export type ServiciosDelWorker = ReturnType<typeof obtenerServiciosDelWorker>;
