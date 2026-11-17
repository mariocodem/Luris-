import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import { cargarProcesoAutorizado } from '@/modules/procesos/application/acceso-a-proceso';
import type { RepositorioDeProcesos } from '@/modules/procesos/application/puertos';
import { nombreDeProceso } from '@/modules/procesos/domain/proceso';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { alcanceDe } from '@/modules/usuarios/domain/permisos';
import { AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { seleccionarNuevas } from '../domain/actuaciones';
import type { ActuacionExterna, ExpedienteExterno } from '../domain/consulta';
import { type CodigoPlataforma, NOMBRE_EN_FRASE } from '../domain/plataforma';
import type { LectorDeConsultaAsistida } from '../domain/puertos';
import { mensajeDeResumen } from '../domain/sincronizacion';
import { type DependenciasDeGuardado, guardarConsulta } from './guardar-consulta';
import type { PendienteDeConfirmacion, RepositorioDePendientes } from './puertos';

/**
 * Consulta asistida (§6) para las plataformas con reto (CAPTCHA), hoy el SPOA de la Fiscalía:
 * 1. LURIS prepara la consulta (el número y el portal oficial).
 * 2. La persona consulta en el portal y resuelve el reto ella misma: LURIS nunca lo resuelve,
 *    lo evade ni lo terceriza.
 * 3. La persona pega el resultado; LURIS lo lee, muestra lo que entendió y, al confirmarlo, lo
 *    guarda como cualquier otra consulta (detecta lo nuevo y queda notificable).
 */

export interface DependenciasDeConsultaAsistida extends DependenciasDeGuardado {
  readonly procesos: RepositorioDeProcesos;
  readonly lectores: ReadonlyMap<CodigoPlataforma, LectorDeConsultaAsistida>;
  readonly pendientes: RepositorioDePendientes;
  readonly auditoria: RegistradorDeAuditoria;
}

export class ErrorSinIdentificadorParaPlataforma extends AppError {
  constructor(plataforma: CodigoPlataforma, identificador: 'RADICADO' | 'NUNC') {
    super({
      codigo: 'SIN_IDENTIFICADOR',
      mensajeUsuario: `Este proceso no tiene ${identificador === 'NUNC' ? 'NUNC' : 'radicado'}, que es el número con el que se consulta ${NOMBRE_EN_FRASE[plataforma]}. Agrégalo editando el proceso.`,
    });
  }
}

export interface ConsultaAsistidaPreparada {
  readonly procesoId: string;
  readonly nombre: string;
  readonly plataforma: CodigoPlataforma;
  readonly identificador: 'RADICADO' | 'NUNC';
  /** El número a consultar en el portal (solo dígitos). */
  readonly numero: string;
  readonly urlDelPortal: string;
}

export interface VistaPreviaAsistida {
  readonly expediente: ExpedienteExterno | null;
  /** Lo que se guardaría, la más reciente primero. */
  readonly actuaciones: readonly ActuacionExterna[];
  /** Cuántas no estaban guardadas. */
  readonly nuevas: number;
  readonly primeraConsulta: boolean;
}

async function cargar(
  deps: DependenciasDeConsultaAsistida,
  contexto: ContextoDeSesion,
  procesoId: string,
  plataforma: CodigoPlataforma,
) {
  const lector = deps.lectores.get(plataforma);
  if (!lector) {
    return err(
      new ErrorNoEncontrado(
        'Esa plataforma no tiene consulta asistida.',
        `Sin lector asistido para ${plataforma}`,
      ),
    );
  }
  const cargado = await cargarProcesoAutorizado(deps.procesos, contexto, procesoId, 'ver');
  if (!cargado.ok) return cargado;
  const { proceso, actor } = cargado.value;
  const numero = lector.identificador === 'NUNC' ? proceso.nunc : proceso.radicado;
  if (!numero)
    return err(new ErrorSinIdentificadorParaPlataforma(plataforma, lector.identificador));
  return ok({ lector, proceso, actor, numero });
}

export function crearPrepararConsultaAsistida(deps: DependenciasDeConsultaAsistida) {
  return async function prepararConsultaAsistida(
    contexto: ContextoDeSesion,
    procesoId: string,
    plataforma: CodigoPlataforma,
  ): Promise<Result<ConsultaAsistidaPreparada, AppError>> {
    const cargado = await cargar(deps, contexto, procesoId, plataforma);
    if (!cargado.ok) return cargado;
    const { lector, proceso, numero } = cargado.value;
    return ok({
      procesoId: proceso.id,
      nombre: nombreDeProceso(proceso),
      plataforma,
      identificador: lector.identificador,
      numero,
      urlDelPortal: lector.urlDelPortal,
    });
  };
}

/** Lee el texto pegado y muestra qué se guardaría, sin guardar nada. */
export function crearInterpretarConsultaAsistida(deps: DependenciasDeConsultaAsistida) {
  return async function interpretarConsultaAsistida(
    contexto: ContextoDeSesion,
    procesoId: string,
    plataforma: CodigoPlataforma,
    texto: string,
  ): Promise<Result<VistaPreviaAsistida, AppError>> {
    const cargado = await cargar(deps, contexto, procesoId, plataforma);
    if (!cargado.ok) return cargado;
    const { lector, actor, numero } = cargado.value;

    const resultado = lector.interpretar(texto, numero);
    if (!resultado.ok) return resultado;
    const previo = await deps.repositorio.estadoPrevio(actor.despacho.id, procesoId, plataforma);
    return ok({
      expediente: resultado.value.expedientes[0] ?? null,
      actuaciones: resultado.value.actuaciones,
      nuevas: seleccionarNuevas(previo.claves, resultado.value.actuaciones).length,
      primeraConsulta: !previo.yaSincronizado,
    });
  };
}

/** Guarda el resultado confirmado y cierra el pendiente de la bandeja, si lo había. */
export function crearConfirmarConsultaAsistida(deps: DependenciasDeConsultaAsistida) {
  return async function confirmarConsultaAsistida(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly procesoId: string;
      readonly plataforma: CodigoPlataforma;
      readonly texto: string;
      readonly ip: string | null;
    },
  ): Promise<Result<{ readonly mensaje: string; readonly nuevas: number }, AppError>> {
    const { procesoId, plataforma } = solicitud;
    const cargado = await cargar(deps, contexto, procesoId, plataforma);
    if (!cargado.ok) return cargado;
    const { lector, actor, numero } = cargado.value;

    const resultado = lector.interpretar(solicitud.texto, numero);
    if (!resultado.ok) return resultado;
    const resumen = await guardarConsulta(deps, actor.despacho.id, procesoId, resultado.value);
    await deps.pendientes.resolver(actor.despacho.id, procesoId, plataforma, deps.reloj.ahora());
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'PROCESO_CONSULTA_ASISTIDA',
      entidad: 'Proceso',
      entidadId: procesoId,
      datos: { plataforma, nuevas: resumen.nuevas, cargaInicial: resumen.cargaInicial },
      ip: solicitud.ip,
    });
    return ok({ mensaje: mensajeDeResumen(plataforma, resumen), nuevas: resumen.nuevas });
  };
}

/** Bandeja «Pendientes de tu confirmación»: solo los procesos que la persona puede ver (§5). */
export function crearListarPendientes(deps: { readonly pendientes: RepositorioDePendientes }) {
  return async function listarPendientes(
    contexto: ContextoDeSesion,
  ): Promise<Result<readonly PendienteDeConfirmacion[], AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_CONSULTAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    return ok(
      await deps.pendientes.listar(
        actor.despacho.id,
        alcanceDe(actor.perfil, 'PROCESOS_CONSULTAR') === 'TODOS'
          ? { tipo: 'DESPACHO' }
          : { tipo: 'PARTICIPANTE', membresiaId: actor.membresiaId },
      ),
    );
  };
}
