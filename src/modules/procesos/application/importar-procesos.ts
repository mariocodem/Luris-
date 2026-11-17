import type { RegistradorDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import {
  exigirMiembroConPermiso,
  type ContextoDeSesion,
} from '@/modules/usuarios/application/contexto-de-sesion';
import type { AppError } from '@/shared/domain/app-error';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorDeImportacion } from '../domain/errores';
import {
  analizarFilas,
  MAXIMO_FILAS_DE_IMPORTACION,
  type DuplicadoEnArchivo,
  type ErrorDeFila,
  type ProcesoAImportar,
} from '../domain/importacion';
import type { DatosDeProceso } from '../domain/proceso';
import { asignacionDelCreador } from '../domain/reglas';
import type {
  ArchivoTabular,
  LectorDeTablas,
  ProcesoExistente,
  RepositorioDeProcesos,
} from './puertos';

export interface VistaPreviaDeImportacion {
  readonly filasConDatos: number;
  /** Listos para importar. */
  readonly nuevos: readonly ProcesoAImportar[];
  /** Ya existen en el despacho: no se volverán a crear. */
  readonly yaRegistrados: readonly ProcesoAImportar[];
  readonly errores: readonly ErrorDeFila[];
  readonly duplicados: readonly DuplicadoEnArchivo[];
}

function yaExiste(
  proceso: Pick<DatosDeProceso, 'radicado' | 'nunc'>,
  existentes: readonly ProcesoExistente[],
): boolean {
  return existentes.some(
    (p) =>
      (proceso.radicado !== null && p.radicado === proceso.radicado) ||
      (proceso.nunc !== null && p.nunc === proceso.nunc),
  );
}

async function existentesEnElDespacho(
  procesos: RepositorioDeProcesos,
  despachoId: string,
  lista: readonly Pick<DatosDeProceso, 'radicado' | 'nunc'>[],
): Promise<readonly ProcesoExistente[]> {
  return procesos.buscarPorIdentificadores(despachoId, {
    radicados: lista.flatMap((p) => (p.radicado ? [p.radicado] : [])),
    nuncs: lista.flatMap((p) => (p.nunc ? [p.nunc] : [])),
  });
}

/**
 * Paso 1: lee el archivo, normaliza y valida cada fila, quita duplicados y marca lo que ya está
 * registrado. No guarda nada: la persona revisa el resumen antes de importar.
 */
export function crearPrevisualizarImportacion(deps: {
  readonly procesos: RepositorioDeProcesos;
  readonly lector: LectorDeTablas;
}) {
  return async function previsualizarImportacion(
    contexto: ContextoDeSesion,
    archivo: ArchivoTabular,
  ): Promise<Result<VistaPreviaDeImportacion, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_REGISTRAR_EDITAR');
    if (!permiso.ok) return permiso;

    const filas = await deps.lector.leer(archivo);
    if (!filas.ok) return filas;
    const analisis = analizarFilas(filas.value);
    if (!analisis.ok) return analisis;

    const existentes = await existentesEnElDespacho(
      deps.procesos,
      permiso.value.despacho.id,
      analisis.value.validos,
    );
    return ok({
      filasConDatos: analisis.value.filasConDatos,
      nuevos: analisis.value.validos.filter((p) => !yaExiste(p, existentes)),
      yaRegistrados: analisis.value.validos.filter((p) => yaExiste(p, existentes)),
      errores: analisis.value.errores,
      duplicados: analisis.value.duplicados,
    });
  };
}

export interface ResultadoDeImportacion {
  readonly creados: number;
  /** Ya existían (otra persona los registró mientras tanto, o venían repetidos). */
  readonly omitidos: number;
}

/**
 * Paso 2: importa los procesos confirmados. Los datos llegan del navegador, así que la frontera
 * los vuelve a validar con Zod y aquí se vuelven a comprobar duplicados y permisos.
 */
export function crearImportarProcesos(deps: {
  readonly procesos: RepositorioDeProcesos;
  readonly auditoria: RegistradorDeAuditoria;
}) {
  return async function importarProcesos(
    contexto: ContextoDeSesion,
    solicitud: { readonly procesos: readonly DatosDeProceso[]; readonly ip: string | null },
  ): Promise<Result<ResultadoDeImportacion, AppError>> {
    const permiso = exigirMiembroConPermiso(contexto, 'PROCESOS_REGISTRAR_EDITAR');
    if (!permiso.ok) return permiso;
    const actor = permiso.value;
    const despachoId = actor.despacho.id;

    if (solicitud.procesos.length === 0) {
      return err(new ErrorDeImportacion('No hay procesos nuevos para importar.'));
    }
    if (solicitud.procesos.length > MAXIMO_FILAS_DE_IMPORTACION) {
      return err(
        new ErrorDeImportacion(
          `Puedes importar máximo ${MAXIMO_FILAS_DE_IMPORTACION} procesos a la vez.`,
        ),
      );
    }

    // Sin repetidos dentro del lote.
    const vistos = new Set<string>();
    const unicos = solicitud.procesos.filter((p) => {
      const claves = [p.radicado && `R${p.radicado}`, p.nunc && `N${p.nunc}`].filter(
        (clave): clave is string => !!clave,
      );
      if (claves.some((clave) => vistos.has(clave))) return false;
      for (const clave of claves) vistos.add(clave);
      return true;
    });

    const existentes = await existentesEnElDespacho(deps.procesos, despachoId, unicos);
    const asignacion = asignacionDelCreador(actor.perfil, actor.membresiaId);
    const nuevos = unicos
      .filter((p) => !yaExiste(p, existentes))
      .map((p) => ({ ...p, asignaciones: asignacion ? [asignacion] : [] }));

    const creados = nuevos.length > 0 ? await deps.procesos.registrarVarios(despachoId, nuevos) : 0;
    const omitidos = solicitud.procesos.length - creados;

    await deps.auditoria.registrar({
      despachoId,
      actorId: actor.usuarioId,
      accion: 'PROCESOS_IMPORTADOS',
      entidad: 'Proceso',
      datos: { creados, omitidos },
      ip: solicitud.ip,
    });
    return ok({ creados, omitidos });
  };
}
