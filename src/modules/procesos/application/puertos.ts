import type { ExpedienteExterno } from '@/modules/plataformas/domain/consulta';
import type { CodigoPlataforma, EstadoConsulta } from '@/modules/plataformas/domain/plataforma';
import type { Result } from '@/shared/domain/result';
import type { ErrorDeImportacion } from '../domain/errores';
import type { Asignacion, DatosDeProceso } from '../domain/proceso';
import type { MiembroAsignable } from '../domain/reglas';

/**
 * Puertos de la gestión de procesos. Las implementaciones (Prisma, lectores de hojas de cálculo)
 * se conectan en composition-root.ts. Todas las operaciones reciben el despacho de la sesión.
 */

// ─── Lecturas ─────────────────────────────────────────────────────────────────

export interface ResumenDeProceso {
  readonly id: string;
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly activo: boolean;
  readonly etiquetas: readonly string[];
  readonly responsable: { readonly membresiaId: string; readonly nombre: string } | null;
  /** Fecha oficial de la actuación más reciente (día calendario), si ya hay actuaciones. */
  readonly ultimaActuacion: Date | null;
  readonly creadoEn: Date;
}

export const ESTADOS_DE_FILTRO = ['activos', 'archivados', 'todos'] as const;
export type EstadoDeFiltro = (typeof ESTADOS_DE_FILTRO)[number];

export const ORDENES_DE_PROCESOS = ['recientes', 'alias'] as const;
export type OrdenDeProcesos = (typeof ORDENES_DE_PROCESOS)[number];

export const PROCESOS_POR_PAGINA = 50;

export interface FiltrosDeProcesos {
  /** Busca en radicado, NUNC, alias y cliente. */
  readonly texto: string | null;
  readonly estado: EstadoDeFiltro;
  readonly etiquetaId: string | null;
  /** Membresía del responsable, o 'ninguno' para los procesos sin responsable. */
  readonly responsable: string | 'ninguno' | null;
  readonly orden: OrdenDeProcesos;
  /** Desde 1. */
  readonly pagina: number;
}

/** Qué procesos puede listar la persona: todos los del despacho o solo en los que participa. */
export type AlcanceDeLista =
  { readonly tipo: 'DESPACHO' } | { readonly tipo: 'PARTICIPANTE'; readonly membresiaId: string };

export interface PaginaDeProcesos {
  readonly procesos: readonly ResumenDeProceso[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface AsignacionDetallada extends Asignacion {
  readonly nombre: string;
  readonly rol: MiembroAsignable['rol'];
  readonly activa: boolean;
}

export interface PlataformaDeProceso {
  readonly plataforma: CodigoPlataforma;
  /** Última consulta exitosa (instante de LURIS). */
  readonly ultimaSincronizacionEn: Date | null;
  /** Último intento, exitoso o no. */
  readonly ultimaConsultaEn: Date | null;
  readonly estadoUltimaConsulta: EstadoConsulta | null;
  /** Datos del proceso según la plataforma (vacío si aún no se ha consultado con éxito). */
  readonly expedientes: readonly ExpedienteExterno[];
}

export interface DocumentoDeActuacion {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'PENDIENTE' | 'DESCARGADO' | 'NO_DISPONIBLE';
  /** Fecha oficial de publicación en la plataforma, si la informa. */
  readonly fechaCarga: Date | null;
  /** El navegador puede mostrarlo dentro de LURIS (PDF, imágenes). */
  readonly visibleEnLinea: boolean;
}

/** Días durante los que una actuación detectada (no de carga inicial) se marca como nueva. */
export const DIAS_COMO_NUEVA = 7;

export interface ActuacionDeProceso {
  readonly id: string;
  readonly plataforma: CodigoPlataforma;
  /** Fechas oficiales de la plataforma (día calendario). Nunca la fecha de detección. */
  readonly fechaActuacion: Date;
  readonly fechaRegistro: Date | null;
  readonly descripcion: string;
  readonly anotacion: string | null;
  /** Juzgado o tribunal que la registró, según la plataforma. */
  readonly despachoJudicial: string | null;
  /** Término que corre por la actuación (fechas oficiales). */
  readonly terminoInicia: Date | null;
  readonly terminoVence: Date | null;
  readonly tieneDocumentos: boolean;
  readonly documentos: readonly DocumentoDeActuacion[];
  /** Llegó después de la carga inicial, en los últimos DIAS_COMO_NUEVA días. */
  readonly nueva: boolean;
}

/** Máximo de actuaciones que trae la ficha del proceso (las más recientes). */
export const ACTUACIONES_EN_LA_FICHA = 200;

export interface DetalleDeProceso {
  readonly id: string;
  readonly radicado: string | null;
  readonly nunc: string | null;
  readonly alias: string | null;
  readonly cliente: string | null;
  readonly activo: boolean;
  readonly creadoEn: Date;
  readonly etiquetas: readonly { readonly id: string; readonly nombre: string }[];
  readonly asignaciones: readonly AsignacionDetallada[];
  readonly plataformas: readonly PlataformaDeProceso[];
  /** Las más recientes primero, hasta ACTUACIONES_EN_LA_FICHA. */
  readonly actuaciones: readonly ActuacionDeProceso[];
  readonly totalActuaciones: number;
}

// ─── Escrituras ───────────────────────────────────────────────────────────────

export interface NuevoProceso extends DatosDeProceso {
  readonly asignaciones: readonly Asignacion[];
}

export interface ProcesoExistente {
  readonly id: string;
  readonly radicado: string | null;
  readonly nunc: string | null;
}

export interface RepositorioDeProcesos {
  listar(
    despachoId: string,
    filtros: FiltrosDeProcesos,
    alcance: AlcanceDeLista,
  ): Promise<PaginaDeProcesos>;
  buscar(despachoId: string, procesoId: string): Promise<DetalleDeProceso | null>;
  /** Procesos del despacho que ya usan alguno de esos radicados o NUNC. */
  buscarPorIdentificadores(
    despachoId: string,
    identificadores: { readonly radicados: readonly string[]; readonly nuncs: readonly string[] },
  ): Promise<readonly ProcesoExistente[]>;
  /** Crea el proceso con sus etiquetas (las nuevas se crean) y sus asignaciones. */
  registrar(despachoId: string, nuevo: NuevoProceso): Promise<Result<{ id: string }, 'DUPLICADO'>>;
  /** Como `registrar`, para un lote; omite los que ya existan. Devuelve cuántos creó. */
  registrarVarios(despachoId: string, nuevos: readonly NuevoProceso[]): Promise<number>;
  /**
   * Actualiza datos y etiquetas. Si cambiaron el radicado o el NUNC, borra los registros de
   * plataforma del identificador anterior (solo se permite si no hay actuaciones).
   */
  actualizar(
    despachoId: string,
    procesoId: string,
    datos: DatosDeProceso,
    opciones: { readonly cambiaronIdentificadores: boolean },
  ): Promise<Result<void, 'DUPLICADO'>>;
  cambiarActivo(despachoId: string, procesoId: string, activo: boolean): Promise<void>;
  /** Deja a esa persona como única responsable (o sin responsable, con null). */
  establecerResponsable(
    despachoId: string,
    procesoId: string,
    membresiaId: string | null,
  ): Promise<void>;
  agregarAsignado(despachoId: string, procesoId: string, membresiaId: string): Promise<void>;
  quitarAsignado(despachoId: string, procesoId: string, membresiaId: string): Promise<void>;
}

/** Personas y etiquetas del despacho, para formularios, filtros y validaciones. */
export interface DirectorioDelDespacho {
  miembros(despachoId: string): Promise<readonly MiembroAsignable[]>;
  etiquetas(
    despachoId: string,
  ): Promise<readonly { readonly id: string; readonly nombre: string }[]>;
}

// ─── Importación ──────────────────────────────────────────────────────────────

export interface ArchivoTabular {
  readonly nombre: string;
  /** Tipo MIME declarado por el navegador (orientativo: se valida el contenido). */
  readonly tipo: string;
  readonly contenido: Uint8Array;
}

/** Lee la primera hoja de un .xlsx o un .csv como filas de texto. */
export interface LectorDeTablas {
  leer(archivo: ArchivoTabular): Promise<Result<string[][], ErrorDeImportacion>>;
}
