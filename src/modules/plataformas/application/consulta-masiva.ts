import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type {
  ArchivoTabular,
  LectorDeTablas,
  RepositorioDeProcesos,
} from '@/modules/procesos/application/puertos';
import { permisosSobreProceso, asignacionDelCreador } from '@/modules/procesos/domain/reglas';
import { reservarCupo } from '@/modules/usuarios/application/cupo';
import type { LimitadorDeIntentos } from '@/modules/usuarios/application/puertos';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
  type ContextoMiembro,
} from '@/modules/usuarios/application/contexto-de-sesion';
import { AppError, ErrorNoEncontrado } from '@/shared/domain/app-error';
import { reconocerIdentificador } from '@/shared/domain/identificador';
import { err, ok, type Result } from '@/shared/domain/result';
import {
  contarItems,
  ERRORES_VISIBLES_EN_EL_RESUMEN,
  leerIdentificadores,
  MAXIMO_DE_CONSULTA_MASIVA,
  MENSAJE_DE_ITEM_ASISTIDO,
  resultadoDeReintento,
  resultadoDeSincronizacion,
  type ConteoDeItems,
  type ErrorDeLectura,
} from '../domain/consulta-masiva';
import type { CodigoErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma } from '../domain/plataforma';
import type { ResumenDeSincronizacion } from '../domain/sincronizacion';
import type {
  ColaDeTrabajos,
  ItemDeConsultaMasiva,
  ItemNuevoDeConsultaMasiva,
  LoteDeConsultaMasiva,
  ProcesoParaConsultaMasiva,
  Reloj,
  RepositorioDeConsultasMasivas,
  RepositorioDePendientes,
  SolicitudDeSincronizacion,
} from './puertos';
import { identificadorPara, type PlataformaAutomatica } from './solicitar-consulta';
import type { PlataformaAsistida } from './programar-sincronizacion';

/** La entrada de la consulta masiva no se puede usar. El mensaje dice qué hacer (§10). */
export class ErrorDeConsultaMasiva extends AppError {
  constructor(mensajeUsuario: string, detalleTecnico?: string) {
    super({ codigo: 'CONSULTA_MASIVA_INVALIDA', mensajeUsuario, detalleTecnico });
  }
}

const NO_ENCONTRADA = 'No encontramos esa consulta masiva. Revisa que el enlace sea correcto.';

export interface DependenciasDeConsultaMasiva {
  readonly masivas: RepositorioDeConsultasMasivas;
  readonly procesos: RepositorioDeProcesos;
  readonly pendientes: RepositorioDePendientes;
  readonly cola: ColaDeTrabajos;
  readonly lector: LectorDeTablas;
  /** En el orden de prioridad del §1. */
  readonly automaticas: readonly PlataformaAutomatica[];
  readonly asistidas: readonly PlataformaAsistida[];
  readonly auditoria: RegistradorDeAuditoria;
  readonly reloj: Reloj;
  /** Cupo de consultas masivas por persona (frena el abuso del worker y de las plataformas). */
  readonly limitador?: LimitadorDeIntentos;
}

// ─── Qué se consulta de cada número ───────────────────────────────────────────

interface PlataformaDelNumero {
  readonly plataforma: CodigoPlataforma;
  /** AUTOMATICA: la consulta el worker. ASISTIDA: la confirma la persona (§6). */
  readonly modo: 'AUTOMATICA' | 'ASISTIDA';
}

/** Plataformas donde se consulta un radicado o NUNC, en el orden de prioridad del §1. */
function plataformasDelNumero(
  deps: Pick<DependenciasDeConsultaMasiva, 'automaticas' | 'asistidas'>,
  tipo: 'RADICADO' | 'NUNC',
  valor: string,
): readonly PlataformaDelNumero[] {
  const proceso =
    tipo === 'RADICADO' ? { radicado: valor, nunc: null } : { radicado: null, nunc: valor };
  const automaticas = deps.automaticas
    .filter((p) => identificadorPara(p, proceso) !== null)
    .map((p): PlataformaDelNumero => ({ plataforma: p.codigo, modo: 'AUTOMATICA' }));
  const asistidas = deps.asistidas
    .filter((p) => p.identificador === tipo)
    .map((p): PlataformaDelNumero => ({ plataforma: p.codigo, modo: 'ASISTIDA' }));
  return [...automaticas, ...asistidas];
}

function procesoDelNumero(
  existentes: readonly ProcesoParaConsultaMasiva[],
  tipo: 'RADICADO' | 'NUNC',
  valor: string,
): ProcesoParaConsultaMasiva | undefined {
  return existentes.find((p) => (tipo === 'RADICADO' ? p.radicado === valor : p.nunc === valor));
}

// ─── Resumen previo ───────────────────────────────────────────────────────────

export interface ProcesoDeLaVistaPrevia {
  readonly tipo: 'RADICADO' | 'NUNC';
  readonly identificador: string;
  /** NUEVO: LURIS lo registrará al ejecutar. REGISTRADO: ya está en el despacho. */
  readonly situacion: 'NUEVO' | 'REGISTRADO';
  readonly plataformas: readonly PlataformaDelNumero[];
}

export interface ProcesoExcluido {
  readonly tipo: 'RADICADO' | 'NUNC';
  readonly identificador: string;
  readonly motivo: 'ARCHIVADO' | 'SIN_ACCESO';
  readonly mensaje: string;
}

export interface VistaPreviaDeConsultaMasiva {
  /** Se pueden consultar. */
  readonly procesos: readonly ProcesoDeLaVistaPrevia[];
  readonly nuevos: number;
  readonly excluidos: readonly ProcesoExcluido[];
  /** Los primeros; el total está en `totalErrores`. */
  readonly errores: readonly ErrorDeLectura[];
  readonly totalErrores: number;
  readonly repetidos: number;
  /** Consultas por hacer (un proceso en cada plataforma que le aplica). */
  readonly consultas: number;
  /** Pegaron más de lo permitido: no se puede ejecutar. */
  readonly sobrante: number;
  readonly maximo: number;
}

const MENSAJE_ARCHIVADO =
  'Este proceso está archivado en el despacho. Reactívalo en Procesos para consultarlo.';
const MENSAJE_SIN_ACCESO =
  'Este número ya está registrado en el despacho y no lo tienes asignado. Pídele al administrador que te lo asigne.';

async function clasificar(
  deps: DependenciasDeConsultaMasiva,
  actor: ContextoMiembro,
  validos: readonly { readonly tipo: 'RADICADO' | 'NUNC'; readonly valor: string }[],
) {
  const existentes = await deps.masivas.procesosPorIdentificadores(actor.despacho.id, {
    radicados: validos.filter((v) => v.tipo === 'RADICADO').map((v) => v.valor),
    nuncs: validos.filter((v) => v.tipo === 'NUNC').map((v) => v.valor),
  });

  const consultables: ProcesoDeLaVistaPrevia[] = [];
  const excluidos: ProcesoExcluido[] = [];
  for (const { tipo, valor } of validos) {
    const existente = procesoDelNumero(existentes, tipo, valor);
    if (existente) {
      const permisos = permisosSobreProceso(
        actor.perfil,
        existente.asignaciones,
        actor.membresiaId,
      );
      if (!permisos.ver) {
        excluidos.push({
          tipo,
          identificador: valor,
          motivo: 'SIN_ACCESO',
          mensaje: MENSAJE_SIN_ACCESO,
        });
        continue;
      }
      if (!existente.activo) {
        excluidos.push({
          tipo,
          identificador: valor,
          motivo: 'ARCHIVADO',
          mensaje: MENSAJE_ARCHIVADO,
        });
        continue;
      }
    }
    consultables.push({
      tipo,
      identificador: valor,
      situacion: existente ? 'REGISTRADO' : 'NUEVO',
      plataformas: plataformasDelNumero(deps, tipo, valor),
    });
  }
  return { consultables, excluidos };
}

/** Une lo pegado y lo subido en un solo texto para leerlo. */
function textoDeLaSolicitud(
  texto: string | null,
  filas: readonly (readonly string[])[] | null,
): string {
  const partes: string[] = [];
  if (texto) partes.push(texto);
  if (filas) partes.push(filas.map((fila) => fila.join('\t')).join('\n'));
  return partes.join('\n');
}

/**
 * Paso 1 (§7): lee lo que pegó o subió la persona (texto, CSV o XLSX), normaliza, valida, quita
 * repetidos y muestra el resumen antes de ejecutar. No guarda nada.
 */
export function crearPrevisualizarConsultaMasiva(deps: DependenciasDeConsultaMasiva) {
  return async function previsualizarConsultaMasiva(
    contexto: ContextoDeSesion,
    entrada: { readonly texto: string | null; readonly archivo: ArchivoTabular | null },
  ): Promise<Result<VistaPreviaDeConsultaMasiva, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CONSULTA_MASIVA');
    if (!permiso.ok) return permiso;

    let filas: string[][] | null = null;
    if (entrada.archivo) {
      const leido = await deps.lector.leer(entrada.archivo);
      if (!leido.ok) return leido;
      filas = leido.value;
    }
    const lectura = leerIdentificadores(textoDeLaSolicitud(entrada.texto, filas));
    if (lectura.validos.length === 0 && lectura.errores.length === 0) {
      return err(
        new ErrorDeConsultaMasiva(
          'No encontramos ningún radicado. Pega los números (uno por línea) o sube un archivo con ellos.',
        ),
      );
    }

    const { consultables, excluidos } = await clasificar(deps, permiso.value, lectura.validos);
    return ok({
      procesos: consultables,
      nuevos: consultables.filter((p) => p.situacion === 'NUEVO').length,
      excluidos,
      errores: lectura.errores.slice(0, ERRORES_VISIBLES_EN_EL_RESUMEN),
      totalErrores: lectura.errores.length,
      repetidos: lectura.repetidos,
      consultas: consultables.reduce((suma, p) => suma + p.plataformas.length, 0),
      sobrante: Math.max(0, consultables.length - MAXIMO_DE_CONSULTA_MASIVA),
      maximo: MAXIMO_DE_CONSULTA_MASIVA,
    });
  };
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

export interface ConsultaMasivaIniciada {
  readonly id: string;
  readonly procesos: number;
  readonly consultas: number;
  /** Procesos que LURIS registró porque aún no estaban en el despacho. */
  readonly registrados: number;
}

/**
 * Paso 2 (§7): registra los procesos que falten, crea el lote y encola una consulta por proceso y
 * plataforma, en el orden de prioridad del §1. Los datos llegan del navegador: se vuelven a leer,
 * validar y comprobar (permisos incluidos). Termina rápido; el worker hace el trabajo.
 */
export function crearIniciarConsultaMasiva(deps: DependenciasDeConsultaMasiva) {
  return async function iniciarConsultaMasiva(
    contexto: ContextoDeSesion,
    solicitud: { readonly identificadores: readonly string[]; readonly ip: string | null },
  ): Promise<Result<ConsultaMasivaIniciada, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CONSULTA_MASIVA');
    if (!permiso.ok) return permiso;
    const registrar = exigirMiembroConPermiso(contexto, 'PROCESOS_REGISTRAR_EDITAR');
    if (!registrar.ok) return registrar;
    const actor = permiso.value;
    const despachoId = actor.despacho.id;
    const cupo = reservarCupo(deps.limitador, `consulta-masiva:${actor.usuarioId}`);
    if (!cupo.ok) return cupo;

    const lectura = leerIdentificadores(solicitud.identificadores.join('\n'));
    if (lectura.validos.length === 0) {
      return err(new ErrorDeConsultaMasiva('No hay radicados válidos para consultar.'));
    }
    if (lectura.validos.length > MAXIMO_DE_CONSULTA_MASIVA) {
      return err(
        new ErrorDeConsultaMasiva(
          `Puedes consultar máximo ${MAXIMO_DE_CONSULTA_MASIVA} procesos a la vez; esta lista tiene ${lectura.validos.length}. Divídela en varias.`,
        ),
      );
    }

    const { consultables } = await clasificar(deps, actor, lectura.validos);
    if (consultables.length === 0) {
      return err(
        new ErrorDeConsultaMasiva(
          'Ninguno de los procesos se puede consultar con tu cuenta. Revisa el resumen y vuelve a intentarlo.',
        ),
      );
    }

    // Los que aún no están en el despacho se registran, con el creador asignado (como al importar).
    const nuevos = consultables.filter((p) => p.situacion === 'NUEVO');
    if (nuevos.length > 0) {
      const asignacion = asignacionDelCreador(actor.perfil, actor.membresiaId);
      const datos = nuevos.flatMap((p) => {
        const reconocido = reconocerIdentificador(p.identificador);
        if (!reconocido.ok) return [];
        return [
          {
            radicado: reconocido.value.tipo === 'RADICADO' ? reconocido.value.valor : null,
            nunc: reconocido.value.tipo === 'NUNC' ? reconocido.value.valor : null,
            alias: null,
            cliente: null,
            etiquetas: [] as readonly string[],
            asignaciones: asignacion ? [asignacion] : [],
          },
        ];
      });
      await deps.procesos.registrarVarios(despachoId, datos);
    }

    // Se vuelven a leer: ya existen todos, y se comprueba otra vez que la persona pueda verlos.
    const existentes = await deps.masivas.procesosPorIdentificadores(despachoId, {
      radicados: consultables.filter((p) => p.tipo === 'RADICADO').map((p) => p.identificador),
      nuncs: consultables.filter((p) => p.tipo === 'NUNC').map((p) => p.identificador),
    });
    const items: ItemNuevoDeConsultaMasiva[] = [];
    const incluidos = new Set<string>();
    for (const p of consultables) {
      const proceso = procesoDelNumero(existentes, p.tipo, p.identificador);
      const puedeVerlo =
        proceso &&
        proceso.activo &&
        permisosSobreProceso(actor.perfil, proceso.asignaciones, actor.membresiaId).ver;
      if (!proceso || !puedeVerlo) continue;
      incluidos.add(p.identificador);
      for (const { plataforma, modo } of p.plataformas) {
        items.push({
          tipo: p.tipo,
          identificador: p.identificador,
          procesoId: proceso.id,
          plataforma,
          estado: modo === 'AUTOMATICA' ? 'PENDIENTE' : 'PENDIENTE_CONFIRMACION',
        });
      }
    }
    if (items.length === 0) {
      return err(
        new ErrorDeConsultaMasiva(
          'No pudimos preparar la consulta. Recarga la página e inténtalo de nuevo.',
          'Sin ítems tras registrar los procesos',
        ),
      );
    }

    const ahora = deps.reloj.ahora();
    const lote = await deps.masivas.crear(despachoId, {
      creadaPorId: actor.membresiaId,
      ahora,
      totalProcesos: incluidos.size,
      items,
    });

    // Lo asistido queda en la bandeja de pendientes; lo automático, en la cola, por prioridad.
    await deps.pendientes.abrirDeConsultaMasiva(
      despachoId,
      items.filter((i) => i.estado === 'PENDIENTE_CONFIRMACION'),
    );
    const orden = new Map(deps.automaticas.map((p, indice) => [p.codigo, indice]));
    const porEncolar: SolicitudDeSincronizacion[] = items
      .filter((i) => i.estado === 'PENDIENTE')
      .sort((a, b) => (orden.get(a.plataforma) ?? 0) - (orden.get(b.plataforma) ?? 0))
      .map((i) => ({ despachoId, procesoId: i.procesoId, plataforma: i.plataforma }));
    if (porEncolar.length > 0) await deps.cola.encolarSincronizaciones(porEncolar);

    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'CONSULTA_MASIVA_INICIADA',
      entidad: 'ConsultaMasiva',
      entidadId: lote.id,
      datos: {
        procesos: incluidos.size,
        consultas: items.length,
        registrados: nuevos.length,
      },
      ip: solicitud.ip,
    });
    return ok({
      id: lote.id,
      procesos: incluidos.size,
      consultas: items.length,
      registrados: nuevos.length,
    });
  };
}

// ─── Consulta de lotes ────────────────────────────────────────────────────────

/** El administrador ve todas las consultas del despacho; las demás personas, solo las suyas. */
function puedeVerElLote(actor: ContextoMiembro, lote: LoteDeConsultaMasiva): boolean {
  return actor.perfil === 'administrador' || lote.creadaPorId === actor.membresiaId;
}

async function cargarLote(
  deps: Pick<DependenciasDeConsultaMasiva, 'masivas'>,
  contexto: ContextoDeSesion,
  id: string,
): Promise<Result<{ actor: ContextoMiembro; lote: LoteDeConsultaMasiva }, AppError>> {
  const permiso = exigirMiembroConPermiso(contexto, 'CONSULTA_MASIVA');
  if (!permiso.ok) return permiso;
  const actor = permiso.value;
  const lote = await deps.masivas.buscar(actor.despacho.id, id);
  if (!lote || !puedeVerElLote(actor, lote)) {
    return err(new ErrorNoEncontrado(NO_ENCONTRADA, `Lote ${id} inexistente o ajeno`));
  }
  return ok({ actor, lote });
}

export interface ListaDeConsultasMasivas {
  readonly lotes: readonly (LoteDeConsultaMasiva & { readonly conteo: ConteoDeItems })[];
  /** Ve las de todo el despacho (administrador) o solo las propias. */
  readonly deTodoElDespacho: boolean;
}

const LOTES_EN_EL_HISTORIAL = 20;

export function crearListarConsultasMasivas(deps: Pick<DependenciasDeConsultaMasiva, 'masivas'>) {
  return async function listarConsultasMasivas(
    contexto: ContextoDeSesion,
  ): Promise<Result<ListaDeConsultasMasivas, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'CONSULTA_MASIVA');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const deTodoElDespacho = actor.perfil === 'administrador';
    const lotes = await deps.masivas.listar(
      actor.despacho.id,
      { creadaPorId: deTodoElDespacho ? null : actor.membresiaId },
      LOTES_EN_EL_HISTORIAL,
    );
    return ok({ lotes, deTodoElDespacho });
  };
}

export interface DetalleDeConsultaMasiva {
  readonly lote: LoteDeConsultaMasiva;
  readonly conteo: ConteoDeItems;
  readonly items: readonly ItemDeConsultaMasiva[];
}

export function crearObtenerConsultaMasiva(deps: Pick<DependenciasDeConsultaMasiva, 'masivas'>) {
  return async function obtenerConsultaMasiva(
    contexto: ContextoDeSesion,
    id: string,
  ): Promise<Result<DetalleDeConsultaMasiva, AppError>> {
    const cargado = await cargarLote(deps, contexto, id);
    if (!cargado.ok) return cargado;
    const { actor, lote } = cargado.value;
    const items = await deps.masivas.items(actor.despacho.id, id);
    return ok({ lote, conteo: contarItems(items.map((i) => i.estado)), items });
  };
}

export interface AvanceDeConsultaMasiva {
  readonly estado: LoteDeConsultaMasiva['estado'];
  readonly conteo: ConteoDeItems;
}

/** Lo mínimo para dibujar la barra de progreso: barato de pedir cada pocos segundos. */
export function crearConsultarAvanceDeConsultaMasiva(
  deps: Pick<DependenciasDeConsultaMasiva, 'masivas'>,
) {
  return async function consultarAvanceDeConsultaMasiva(
    contexto: ContextoDeSesion,
    id: string,
  ): Promise<Result<AvanceDeConsultaMasiva, AppError>> {
    const cargado = await cargarLote(deps, contexto, id);
    if (!cargado.ok) return cargado;
    const { actor, lote } = cargado.value;
    return ok({ estado: lote.estado, conteo: await deps.masivas.conteo(actor.despacho.id, id) });
  };
}

// ─── Reintentar ───────────────────────────────────────────────────────────────

/** «Reintentar» los fallidos del lote (o uno solo): vuelven a la cola y el lote sigue en curso. */
export function crearReintentarConsultaMasiva(deps: DependenciasDeConsultaMasiva) {
  return async function reintentarConsultaMasiva(
    contexto: ContextoDeSesion,
    solicitud: { readonly id: string; readonly itemId: string | null; readonly ip: string | null },
  ): Promise<Result<{ readonly reintentados: number }, AppError>> {
    const cargado = await cargarLote(deps, contexto, solicitud.id);
    if (!cargado.ok) return cargado;
    const { actor } = cargado.value;

    const solicitudes = await deps.masivas.reintentarFallidos(
      actor.despacho.id,
      solicitud.id,
      solicitud.itemId,
    );
    if (solicitudes.length === 0) {
      return err(new ErrorDeConsultaMasiva('No hay consultas fallidas para reintentar.'));
    }
    await deps.cola.encolarSincronizaciones(solicitudes);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'CONSULTA_MASIVA_REINTENTADA',
      entidad: 'ConsultaMasiva',
      entidadId: solicitud.id,
      datos: { reintentados: solicitudes.length },
      ip: solicitud.ip,
    });
    return ok({ reintentados: solicitudes.length });
  };
}

// ─── Exportar ─────────────────────────────────────────────────────────────────

/** Lo que se exporta: el lote y sus ítems, ya verificados para la persona. */
export function crearPrepararExportacionDeConsultaMasiva(
  deps: Pick<DependenciasDeConsultaMasiva, 'masivas' | 'auditoria'>,
) {
  return async function prepararExportacion(
    contexto: ContextoDeSesion,
    solicitud: {
      readonly id: string;
      readonly formato: 'CSV' | 'XLSX';
      readonly ip: string | null;
    },
  ): Promise<Result<DetalleDeConsultaMasiva, AppError>> {
    const cargado = await cargarLote(deps, contexto, solicitud.id);
    if (!cargado.ok) return cargado;
    const { actor, lote } = cargado.value;
    const items = await deps.masivas.items(actor.despacho.id, solicitud.id);
    await deps.auditoria.registrar({
      despachoId: actor.despacho.id,
      actorId: actor.usuarioId,
      accion: 'CONSULTA_MASIVA_EXPORTADA',
      entidad: 'ConsultaMasiva',
      entidadId: solicitud.id,
      datos: { formato: solicitud.formato, filas: items.length },
      ip: solicitud.ip,
    });
    return ok({ lote, conteo: contarItems(items.map((i) => i.estado)), items });
  };
}

// ─── Lo que hace el worker ────────────────────────────────────────────────────

export type ResultadoParaConsultaMasiva =
  | ResumenDeSincronizacion
  /** Falló por algo pasajero y la cola lo reintentará. */
  | { readonly tipo: 'REINTENTO'; readonly codigo: CodigoErrorPlataforma };

/**
 * Cuando el worker termina (o reintenta) la consulta de un proceso en una plataforma, deja el
 * resultado en los ítems de consulta masiva que la esperaban y completa los lotes que acabaron.
 * Una consulta compartida (otro lote, «Consultar ahora», la programada) sirve a todos los ítems.
 */
export function crearRegistrarResultadoDeConsultaMasiva(
  deps: Pick<DependenciasDeConsultaMasiva, 'masivas' | 'reloj'>,
) {
  return async function registrarResultadoDeConsultaMasiva(datos: {
    readonly despachoId: string;
    readonly procesoId: string;
    readonly plataforma: CodigoPlataforma;
    readonly resultado: ResultadoParaConsultaMasiva;
  }): Promise<number> {
    const resultado =
      datos.resultado.tipo === 'REINTENTO'
        ? resultadoDeReintento(datos.plataforma, datos.resultado.codigo)
        : resultadoDeSincronizacion(datos.plataforma, datos.resultado);
    return deps.masivas.registrarResultado(datos.despachoId, {
      procesoId: datos.procesoId,
      plataforma: datos.plataforma,
      resultado,
      ahora: deps.reloj.ahora(),
    });
  };
}

export { MENSAJE_DE_ITEM_ASISTIDO };
