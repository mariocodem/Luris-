import type { AlcanceDeLista } from '@/modules/procesos/application/puertos';
import type { Asignacion } from '@/modules/procesos/domain/proceso';
import type {
  ConteoDeItems,
  EstadoDeItem,
  ResultadoDeItem,
  ResumenDeItem,
} from '../domain/consulta-masiva';
import type { ActuacionConClave } from '../domain/actuaciones';
import type { ResultadoConsulta } from '../domain/consulta';
import type { CodigoErrorPlataforma } from '../domain/errores';
import type { AlcanceDeCredencial } from '../domain/credenciales';
import type { CodigoPlataforma, EstadoConsulta } from '../domain/plataforma';
import type { ResumenDeSincronizacion } from '../domain/sincronizacion';

/**
 * Puertos de la sincronización con las plataformas. Las implementaciones (Prisma, pg-boss) se
 * conectan en composition-root.ts.
 */

export interface Reloj {
  ahora(): Date;
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

export interface ProcesoASincronizar {
  readonly id: string;
  readonly radicado: string | null;
  readonly nunc: string | null;
}

export interface EstadoPrevio {
  /** Ya hubo al menos una consulta exitosa en esta plataforma. */
  readonly yaSincronizado: boolean;
  /** Claves de deduplicación de las actuaciones ya guardadas. */
  readonly claves: ReadonlySet<string>;
}

export interface ActuacionGuardada {
  readonly id: string;
  /** Clave de deduplicación con la que se guardó. */
  readonly clave: string;
  readonly tieneDocumentos: boolean;
}

export interface DatosDeGuardado {
  readonly resultado: ResultadoConsulta;
  readonly nuevas: readonly ActuacionConClave[];
  /** Primera consulta exitosa: las actuaciones son historia, no novedad (no se notifican). */
  readonly cargaInicial: boolean;
  readonly ahora: Date;
}

export interface RepositorioDeSincronizacion {
  obtenerProceso(despachoId: string, procesoId: string): Promise<ProcesoASincronizar | null>;
  estadoPrevio(
    despachoId: string,
    procesoId: string,
    plataforma: CodigoPlataforma,
  ): Promise<EstadoPrevio>;
  /**
   * Guarda los datos del proceso y las actuaciones nuevas en una transacción. Devuelve solo las
   * que de verdad insertó: si otra sincronización ya guardó alguna, no se repite.
   */
  guardarResultado(
    despachoId: string,
    procesoId: string,
    datos: DatosDeGuardado,
  ): Promise<readonly ActuacionGuardada[]>;
  registrarFallo(
    despachoId: string,
    procesoId: string,
    plataforma: CodigoPlataforma,
    codigo: CodigoErrorPlataforma,
    ahora: Date,
  ): Promise<void>;
  /** Despachos activos (no suspendidos), para la sincronización programada. */
  despachosActivos(): Promise<readonly string[]>;
  /** Procesos activos (no archivados) del despacho. */
  procesosActivos(despachoId: string): Promise<readonly ProcesoASincronizar[]>;
}

/** Avisa (por correo y WhatsApp) de las actuaciones nuevas de un proceso (módulo de notificaciones). */
export interface ProgramadorDeNotificaciones {
  programar(datos: {
    readonly despachoId: string;
    readonly procesoId: string;
    readonly actuacionIds: readonly string[];
  }): Promise<number>;
}

// ─── Cola de trabajos ─────────────────────────────────────────────────────────

export interface SolicitudDeSincronizacion {
  readonly despachoId: string;
  readonly procesoId: string;
  readonly plataforma: CodigoPlataforma;
}

export type EstadoDeTrabajo =
  | { readonly estado: 'EN_COLA' }
  | { readonly estado: 'EN_CURSO' }
  /** Falló por algo pasajero y la cola lo reintentará más tarde. */
  | { readonly estado: 'REINTENTANDO' }
  | { readonly estado: 'TERMINADO'; readonly resumen: ResumenDeSincronizacion }
  /** Agotó los reintentos o se canceló. */
  | { readonly estado: 'FALLIDO' };

export interface TrabajoDeSincronizacion {
  readonly despachoId: string;
  readonly procesoId: string;
  readonly estado: EstadoDeTrabajo;
}

export interface ColaDeTrabajos {
  /**
   * Encola la sincronización de un proceso en una plataforma. Si ya hay una en espera para ese
   * proceso, no crea otra: devuelve la existente. `ALTA` = la pidió una persona (va primero).
   */
  encolarSincronizacion(
    solicitud: SolicitudDeSincronizacion,
    prioridad: 'ALTA' | 'NORMAL',
  ): Promise<string>;
  /** Encola un lote con prioridad normal. Devuelve cuántos trabajos creó. */
  encolarSincronizaciones(solicitudes: readonly SolicitudDeSincronizacion[]): Promise<number>;
  estadoDeSincronizacion(
    plataforma: CodigoPlataforma,
    idTrabajo: string,
  ): Promise<TrabajoDeSincronizacion | null>;
  /**
   * Encola el código de acceso (segundo factor) que escribió la persona, cifrado: solo el worker
   * lo descifra para entregarlo a la plataforma.
   */
  encolarCodigoDeAcceso(datos: {
    readonly despachoId: string;
    readonly credencialId: string;
    readonly codigo: SecretoCifrado;
  }): Promise<void>;
  /** Encola la prueba de acceso de una credencial recién guardada. */
  encolarVerificacion(datos: {
    readonly despachoId: string;
    readonly credencialId: string;
  }): Promise<void>;
  /** Encola la obtención de los documentos de una actuación. */
  encolarDocumentos(datos: {
    readonly despachoId: string;
    readonly actuacionId: string;
    readonly plataforma: CodigoPlataforma;
  }): Promise<void>;
}

// ─── Bandeja «Pendientes de tu confirmación» (consultas asistidas, §6) ──────────

export interface PendienteDeConfirmacion {
  readonly id: string;
  readonly procesoId: string;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly plataforma: CodigoPlataforma;
  readonly origen: 'PROGRAMADA' | 'MASIVA';
  readonly creadoEn: Date;
  /** Última consulta exitosa en esa plataforma (instante de LURIS), si la hubo. */
  readonly ultimaConsultaEn: Date | null;
}

export interface RepositorioDePendientes {
  /**
   * Abre un pendiente PROGRAMADA para cada proceso activo del despacho que tenga el identificador
   * de la plataforma, no tenga uno abierto y no se haya consultado con éxito desde `antesDe`.
   * Devuelve cuántos abrió.
   */
  abrirVencidos(
    despachoId: string,
    plataforma: CodigoPlataforma,
    identificador: 'RADICADO' | 'NUNC',
    antesDe: Date,
  ): Promise<number>;
  /**
   * Abre un pendiente MASIVA por cada proceso y plataforma de una consulta masiva (§6). Si ya había
   * uno abierto, lo deja como está. Devuelve cuántos abrió.
   */
  abrirDeConsultaMasiva(
    despachoId: string,
    pendientes: readonly { readonly procesoId: string; readonly plataforma: CodigoPlataforma }[],
  ): Promise<number>;
  /** Cierra el pendiente abierto del proceso en esa plataforma, si lo hay. */
  resolver(
    despachoId: string,
    procesoId: string,
    plataforma: CodigoPlataforma,
    ahora: Date,
  ): Promise<void>;
  /** Pendientes abiertos, los más antiguos primero. */
  listar(despachoId: string, alcance: AlcanceDeLista): Promise<readonly PendienteDeConfirmacion[]>;
}

// ─── Credenciales de plataformas (§4, §6) ──────────────────────────────────────

export interface SecretoCifrado {
  readonly datos: Uint8Array;
  /** Versión de la clave con que se cifró (para rotarla). */
  readonly version: number;
}

export interface CifradorDeCredenciales {
  cifrar(texto: string, contexto: string): SecretoCifrado;
  /** null si no se puede descifrar (otra clave, otro contexto o datos alterados). */
  descifrar(secreto: SecretoCifrado, contexto: string): string | null;
}

/** Lo que se muestra de una credencial: nunca el secreto. */
export interface CredencialResumida {
  readonly id: string;
  readonly plataforma: CodigoPlataforma;
  readonly alcance: AlcanceDeCredencial;
  readonly usuario: string;
  readonly membresiaId: string;
  /** Nombre de quien la registró (titular, si es personal). */
  readonly titular: string;
  readonly consentimientoEn: Date;
  readonly actualizadoEn: Date;
  readonly verificadaEn: Date | null;
  readonly estadoVerificacion: EstadoConsulta | null;
  /** La plataforma pidió un código de acceso y espera que la persona lo escriba. */
  readonly codigoSolicitadoEn: Date | null;
}

export interface CredencialCifrada {
  readonly id: string;
  readonly despachoId: string;
  readonly plataforma: CodigoPlataforma;
  readonly alcance: AlcanceDeCredencial;
  readonly membresiaId: string;
  readonly usuario: string;
  readonly secreto: SecretoCifrado;
  /** Sesión de la plataforma guardada (cookies), cifrada. */
  readonly sesion: SecretoCifrado | null;
  readonly codigoSolicitadoEn: Date | null;
}

export interface RepositorioDeCredenciales {
  /** Las personales de esa membresía y, si se pide, las del despacho. */
  listar(
    despachoId: string,
    filtro: { readonly membresiaId: string; readonly incluirDelDespacho: boolean },
  ): Promise<readonly CredencialResumida[]>;
  buscar(despachoId: string, id: string): Promise<CredencialCifrada | null>;
  /**
   * Crea o reemplaza la credencial (una del despacho por plataforma; una personal por persona y
   * plataforma). Reinicia su verificación.
   */
  guardar(
    despachoId: string,
    datos: {
      readonly membresiaId: string;
      readonly plataforma: CodigoPlataforma;
      readonly alcance: AlcanceDeCredencial;
      readonly usuario: string;
      readonly secreto: SecretoCifrado;
      readonly consentimientoEn: Date;
    },
  ): Promise<{ readonly id: string }>;
  eliminar(despachoId: string, id: string): Promise<void>;
  /**
   * Credenciales con las que se puede consultar un proceso, en orden de preferencia: la personal
   * del abogado responsable, las personales de las demás personas asignadas y la del despacho.
   */
  paraProceso(
    despachoId: string,
    procesoId: string,
    plataforma: CodigoPlataforma,
  ): Promise<readonly CredencialCifrada[]>;
  /** Guarda (o borra, con null) la sesión de la plataforma de la credencial. */
  guardarSesion(
    despachoId: string,
    id: string,
    sesion: SecretoCifrado | null,
    ahora: Date,
  ): Promise<void>;
  /** Marca (o, con null, quita) la espera del código de acceso. */
  marcarCodigoSolicitado(despachoId: string, id: string, en: Date | null): Promise<void>;
  registrarVerificacion(
    despachoId: string,
    id: string,
    estado: EstadoConsulta,
    ahora: Date,
  ): Promise<void>;
}

// ─── Consulta masiva (Fase 10, §7) ─────────────────────────────────────────────

export interface ProcesoParaConsultaMasiva {
  readonly id: string;
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly activo: boolean;
  /** Para decidir si la persona puede verlo (§5). */
  readonly asignaciones: readonly Asignacion[];
}

export interface ItemNuevoDeConsultaMasiva {
  readonly tipo: 'RADICADO' | 'NUNC';
  readonly identificador: string;
  readonly procesoId: string;
  readonly plataforma: CodigoPlataforma;
  /** PENDIENTE: lo consulta el worker. PENDIENTE_CONFIRMACION: lo confirma la persona (§6). */
  readonly estado: 'PENDIENTE' | 'PENDIENTE_CONFIRMACION';
}

export interface LoteDeConsultaMasiva {
  readonly id: string;
  readonly creadaPorId: string;
  readonly creadaPorNombre: string;
  readonly estado: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'CANCELADA';
  /** Procesos del lote (identificadores distintos), no ítems. */
  readonly totalProcesos: number;
  readonly iniciadaEn: Date | null;
  readonly finalizadaEn: Date | null;
  readonly creadoEn: Date;
}

export interface ItemDeConsultaMasiva {
  readonly id: string;
  readonly tipo: 'RADICADO' | 'NUNC';
  readonly identificador: string;
  readonly procesoId: string | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly plataforma: CodigoPlataforma;
  readonly estado: EstadoDeItem;
  readonly resultado: EstadoConsulta | null;
  readonly resumen: ResumenDeItem | null;
  readonly actualizadoEn: Date;
}

export interface RepositorioDeConsultasMasivas {
  /** Procesos del despacho que ya usan alguno de esos radicados o NUNC. */
  procesosPorIdentificadores(
    despachoId: string,
    identificadores: { readonly radicados: readonly string[]; readonly nuncs: readonly string[] },
  ): Promise<readonly ProcesoParaConsultaMasiva[]>;
  /** Crea el lote y sus ítems en una transacción. Sin ítems por consultar, nace completada. */
  crear(
    despachoId: string,
    datos: {
      readonly creadaPorId: string;
      readonly ahora: Date;
      readonly totalProcesos: number;
      readonly items: readonly ItemNuevoDeConsultaMasiva[];
    },
  ): Promise<{ readonly id: string }>;
  buscar(despachoId: string, id: string): Promise<LoteDeConsultaMasiva | null>;
  /** Los más recientes primero. Con `creadaPorId`, solo los de esa persona. */
  listar(
    despachoId: string,
    filtro: { readonly creadaPorId: string | null },
    limite: number,
  ): Promise<readonly (LoteDeConsultaMasiva & { readonly conteo: ConteoDeItems })[]>;
  items(despachoId: string, id: string): Promise<readonly ItemDeConsultaMasiva[]>;
  conteo(despachoId: string, id: string): Promise<ConteoDeItems>;
  /**
   * Guarda cómo terminó la consulta de un proceso en una plataforma en todos los ítems que la
   * esperan (de cualquier lote del despacho) y completa los lotes que ya no tengan nada por
   * consultar. Devuelve cuántos ítems actualizó.
   */
  registrarResultado(
    despachoId: string,
    datos: {
      readonly procesoId: string;
      readonly plataforma: CodigoPlataforma;
      readonly resultado: ResultadoDeItem;
      readonly ahora: Date;
    },
  ): Promise<number>;
  /** La persona confirmó una consulta asistida: sus ítems pendientes quedan completados. */
  resolverAsistidos(
    despachoId: string,
    datos: {
      readonly procesoId: string;
      readonly plataforma: CodigoPlataforma;
      readonly resumen: ResumenDeItem;
      readonly ahora: Date;
    },
  ): Promise<number>;
  /**
   * Devuelve los ítems fallidos a la cola (y el lote a «en proceso») y lista lo que hay que
   * volver a encolar. Con `itemId`, solo ese ítem.
   */
  reintentarFallidos(
    despachoId: string,
    id: string,
    itemId: string | null,
  ): Promise<readonly SolicitudDeSincronizacion[]>;
}
