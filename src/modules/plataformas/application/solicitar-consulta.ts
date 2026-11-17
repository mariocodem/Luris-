import { cargarProcesoAutorizado } from '@/modules/procesos/application/acceso-a-proceso';
import type { RepositorioDeProcesos } from '@/modules/procesos/application/puertos';
import type { ContextoDeSesion } from '@/modules/usuarios/application/contexto-de-sesion';
import { AppError } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { mensajeDeErrorDePlataforma } from '../domain/errores';
import { type CodigoPlataforma, NOMBRE_EN_FRASE } from '../domain/plataforma';
import { mensajeDeResumen } from '../domain/sincronizacion';
import type { ColaDeTrabajos } from './puertos';

/** Plataforma que LURIS consulta sola (sin que la persona resuelva un reto, §6). */
export interface PlataformaAutomatica {
  readonly codigo: CodigoPlataforma;
  readonly identificador: 'RADICADO' | 'NUNC';
  /**
   * Si solo aplica a ciertos procesos (p. ej. SAMAI, a los de lo contencioso administrativo).
   * Recibe el identificador ya verificado. Si se omite, aplica a todo proceso que lo tenga.
   */
  readonly aplica?: (identificador: string) => boolean;
}

/** El número con el que la plataforma consultaría el proceso, si le aplica. */
export function identificadorPara(
  plataforma: PlataformaAutomatica,
  proceso: { readonly radicado: string | null; readonly nunc: string | null },
): string | null {
  const id = plataforma.identificador === 'RADICADO' ? proceso.radicado : proceso.nunc;
  if (!id) return null;
  return !plataforma.aplica || plataforma.aplica(id) ? id : null;
}

export interface DependenciasDeConsultaManual {
  readonly procesos: RepositorioDeProcesos;
  readonly cola: ColaDeTrabajos;
  /** En el orden de prioridad del §1. */
  readonly automaticas: readonly PlataformaAutomatica[];
}

export interface ConsultaSolicitada {
  readonly plataforma: CodigoPlataforma;
  readonly idTrabajo: string;
}

export class ErrorSinConsultaAutomatica extends AppError {
  constructor() {
    super({
      codigo: 'SIN_CONSULTA_AUTOMATICA',
      mensajeUsuario:
        'Este proceso solo tiene NUNC, y el SPOA de la Fiscalía no permite consultas automáticas. Usa «Consultar en SPOA» para hacerla tú mismo.',
    });
  }
}

/**
 * «Consultar ahora» (Fase 5): encola con prioridad alta la sincronización del proceso en cada
 * plataforma automática que le aplique. Verifica en el servidor que la persona pueda verlo.
 */
export function crearSolicitarConsulta(deps: DependenciasDeConsultaManual) {
  return async function solicitarConsulta(
    contexto: ContextoDeSesion,
    procesoId: string,
  ): Promise<Result<readonly ConsultaSolicitada[], AppError>> {
    const cargado = await cargarProcesoAutorizado(deps.procesos, contexto, procesoId, 'ver');
    if (!cargado.ok) return cargado;
    const { actor, proceso } = cargado.value;

    const aplicables = deps.automaticas.filter((p) => identificadorPara(p, proceso) !== null);
    if (aplicables.length === 0) return err(new ErrorSinConsultaAutomatica());

    const solicitadas: ConsultaSolicitada[] = [];
    for (const { codigo } of aplicables) {
      const idTrabajo = await deps.cola.encolarSincronizacion(
        { despachoId: actor.despacho.id, procesoId: proceso.id, plataforma: codigo },
        'ALTA',
      );
      solicitadas.push({ plataforma: codigo, idTrabajo });
    }
    return ok(solicitadas);
  };
}

export interface AvanceDeConsulta {
  readonly plataforma: CodigoPlataforma;
  /** EN_CURSO: aún esperando. El resto son finales para quien espera en pantalla. */
  readonly estado: 'EN_CURSO' | 'TERMINADA' | 'CON_PROBLEMAS';
  readonly mensaje: string;
  /** Actuaciones guardadas (para decidir si recargar la línea de tiempo). */
  readonly nuevas: number;
}

/** Avance de las consultas pedidas con «Consultar ahora», para mostrarlo mientras corren. */
export function crearConsultarAvance(deps: DependenciasDeConsultaManual) {
  return async function consultarAvance(
    contexto: ContextoDeSesion,
    procesoId: string,
    solicitadas: readonly ConsultaSolicitada[],
  ): Promise<Result<readonly AvanceDeConsulta[], AppError>> {
    const cargado = await cargarProcesoAutorizado(deps.procesos, contexto, procesoId, 'ver');
    if (!cargado.ok) return cargado;
    const despachoId = cargado.value.actor.despacho.id;

    const avances: AvanceDeConsulta[] = [];
    for (const { plataforma, idTrabajo } of solicitadas) {
      const trabajo = await deps.cola.estadoDeSincronizacion(plataforma, idTrabajo);
      const esDelProceso = trabajo?.despachoId === despachoId && trabajo.procesoId === procesoId;
      avances.push(
        trabajo && esDelProceso
          ? avanceDe(plataforma, trabajo.estado)
          : {
              plataforma,
              estado: 'CON_PROBLEMAS',
              mensaje: 'No encontramos esa consulta. Recarga la página e inténtalo de nuevo.',
              nuevas: 0,
            },
      );
    }
    return ok(avances);
  };
}

function avanceDe(
  plataforma: CodigoPlataforma,
  estado: NonNullable<Awaited<ReturnType<ColaDeTrabajos['estadoDeSincronizacion']>>>['estado'],
): AvanceDeConsulta {
  const nombre = NOMBRE_EN_FRASE[plataforma];
  switch (estado.estado) {
    case 'EN_COLA':
    case 'EN_CURSO':
      return { plataforma, estado: 'EN_CURSO', mensaje: `Consultando ${nombre}…`, nuevas: 0 };
    case 'REINTENTANDO':
      return {
        plataforma,
        estado: 'CON_PROBLEMAS',
        mensaje: mensajeDeErrorDePlataforma(plataforma, 'PLATAFORMA_NO_DISPONIBLE'),
        nuevas: 0,
      };
    case 'FALLIDO':
      return {
        plataforma,
        estado: 'CON_PROBLEMAS',
        mensaje: `No pudimos consultar ${nombre} después de varios intentos. Lo intentaremos de nuevo en la próxima consulta programada.`,
        nuevas: 0,
      };
    case 'TERMINADO':
      return {
        plataforma,
        estado: estado.resumen.tipo === 'SINCRONIZADO' ? 'TERMINADA' : 'CON_PROBLEMAS',
        mensaje: mensajeDeResumen(plataforma, estado.resumen),
        nuevas: estado.resumen.tipo === 'SINCRONIZADO' ? estado.resumen.nuevas : 0,
      };
  }
}
