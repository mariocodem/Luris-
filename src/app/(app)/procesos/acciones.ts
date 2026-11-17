'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { esquemaDatosDeProceso } from '@/modules/procesos/domain/esquemas';
import { MAXIMO_FILAS_DE_IMPORTACION } from '@/modules/procesos/domain/importacion';
import { separarEtiquetas } from '@/modules/procesos/domain/proceso';
import type { EstadoDeImportacion } from '@/modules/procesos/ui/estado-de-importacion';
import { esquemaId } from '@/modules/usuarios/domain/esquemas';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { estadoDeError, estadoDeValidacion, textosDe } from '../../_servidor/formularios';
import { casosDeUso, ipDeLaPeticion } from '../../_servidor/peticion';

/**
 * Acciones de procesos. Cada una valida la entrada con Zod, vuelve a leer la sesión y deja que
 * el caso de uso verifique el permiso del §5: ocultar botones no es un control de acceso.
 */

async function contexto() {
  const casos = casosDeUso();
  return { casos, sesion: await casos.obtenerContextoDeSesion(), ip: await ipDeLaPeticion() };
}

function textos(formulario: FormData, campo: string): string[] {
  return formulario.getAll(campo).filter((v): v is string => typeof v === 'string');
}

/** Datos del formulario de proceso: campos de texto y etiquetas (marcadas + nuevas). */
function leerFormularioDeProceso(formulario: FormData) {
  const valores = textosDe(formulario);
  const etiquetas = [
    ...textos(formulario, 'etiquetas'),
    ...separarEtiquetas(valores.etiquetasNuevas ?? ''),
  ];
  // Para volver a llenar el formulario si hay errores.
  const conservar = {
    radicado: valores.radicado ?? '',
    nunc: valores.nunc ?? '',
    alias: valores.alias ?? '',
    cliente: valores.cliente ?? '',
    etiquetas: textos(formulario, 'etiquetas').join('\u001f'),
    etiquetasNuevas: valores.etiquetasNuevas ?? '',
    responsableId: valores.responsableId ?? '',
    asignados: textos(formulario, 'asignados').join('\u001f'),
  };
  const datos = esquemaDatosDeProceso.safeParse({
    radicado: valores.radicado,
    nunc: valores.nunc,
    alias: valores.alias,
    cliente: valores.cliente,
    etiquetas,
  });
  return { valores, conservar, datos };
}

const esquemaIdOpcional = z
  .string()
  .default('')
  .pipe(z.union([z.literal(''), esquemaId]))
  .transform((id) => (id === '' ? null : id));

export async function registrarProcesoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const { valores, conservar, datos } = leerFormularioDeProceso(formulario);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);
  const asignaciones = z
    .object({ responsableId: esquemaIdOpcional, asignados: z.array(esquemaId).max(50) })
    .safeParse({
      responsableId: valores.responsableId,
      asignados: textos(formulario, 'asignados'),
    });
  if (!asignaciones.success) return estadoDeValidacion(asignaciones.error, conservar);

  let procesoId: string;
  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'registrar-proceso', conservar);
    const resultado = await casos.registrarProceso(sesion.value, {
      datos: datos.data,
      responsableId: asignaciones.data.responsableId,
      asignadosIds: asignaciones.data.asignados,
      ip,
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'registrar-proceso', conservar);
    procesoId = resultado.value.id;
  } catch (error) {
    return estadoDeError(error, 'registrar-proceso', conservar);
  }
  redirect(`/procesos/${procesoId}?aviso=registrado`);
}

export async function editarProcesoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  const { valores, conservar, datos } = leerFormularioDeProceso(formulario);
  const id = esquemaId.safeParse(valores.procesoId);
  if (!id.success) return estadoDeValidacion(id.error, conservar);
  if (!datos.success) return estadoDeValidacion(datos.error, conservar);

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, 'editar-proceso', conservar);
    const resultado = await casos.editarProceso(sesion.value, {
      procesoId: id.data,
      datos: datos.data,
      ip,
    });
    if (!resultado.ok) return estadoDeError(resultado.error, 'editar-proceso', conservar);
  } catch (error) {
    return estadoDeError(error, 'editar-proceso', conservar);
  }
  redirect(`/procesos/${id.data}?aviso=editado`);
}

/** Acción sencilla sobre un proceso (archivar, asignar…): valida, ejecuta y refresca la página. */
async function accionSobreProceso<T>(
  formulario: FormData,
  esquema: z.ZodType<T>,
  operacion: string,
  ejecutar: (
    casos: Awaited<ReturnType<typeof contexto>>['casos'],
    sesion: Extract<Awaited<ReturnType<typeof contexto>>['sesion'], { ok: true }>['value'],
    datos: T,
    ip: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: unknown }>,
  mensajeDeExito: (datos: T) => string,
): Promise<EstadoDeFormulario> {
  const datos = esquema.safeParse(textosDe(formulario));
  if (!datos.success) return estadoDeValidacion(datos.error);
  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return estadoDeError(sesion.error, operacion);
    const resultado = await ejecutar(casos, sesion.value, datos.data, ip);
    if (!resultado.ok) return estadoDeError(resultado.error, operacion);
  } catch (error) {
    return estadoDeError(error, operacion);
  }
  refresh();
  return { tipo: 'exito', mensaje: mensajeDeExito(datos.data) };
}

export async function cambiarEstadoDeProcesoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  return accionSobreProceso(
    formulario,
    z.object({ procesoId: esquemaId, activo: z.enum(['si', 'no']) }),
    'estado-de-proceso',
    (casos, sesion, d, ip) =>
      casos.cambiarEstadoDeProceso(sesion, {
        procesoId: d.procesoId,
        activo: d.activo === 'si',
        ip,
      }),
    (d) => (d.activo === 'si' ? 'Proceso restaurado.' : 'Proceso archivado.'),
  );
}

export async function asignarResponsableAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  return accionSobreProceso(
    formulario,
    z.object({ procesoId: esquemaId, membresiaId: esquemaIdOpcional }),
    'asignar-responsable',
    (casos, sesion, d, ip) => casos.asignarResponsable(sesion, { ...d, ip }),
    (d) => (d.membresiaId ? 'Responsable actualizado.' : 'El proceso quedó sin responsable.'),
  );
}

export async function agregarAsignadoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  return accionSobreProceso(
    formulario,
    z.object({
      procesoId: esquemaId,
      membresiaId: z.uuid({ error: 'Elige a la persona que vas a asignar.' }),
    }),
    'agregar-asignado',
    (casos, sesion, d, ip) => casos.agregarAsignado(sesion, { ...d, ip }),
    () => 'Persona asignada al proceso.',
  );
}

export async function quitarAsignadoAccion(
  _anterior: EstadoDeFormulario,
  formulario: FormData,
): Promise<EstadoDeFormulario> {
  return accionSobreProceso(
    formulario,
    z.object({ procesoId: esquemaId, membresiaId: esquemaId }),
    'quitar-asignado',
    (casos, sesion, d, ip) => casos.quitarAsignado(sesion, { ...d, ip }),
    () => 'Persona quitada del proceso.',
  );
}

// ─── Importación ──────────────────────────────────────────────────────────────

/** Lo que el navegador devuelve al confirmar: se vuelve a validar todo con los esquemas. */
const esquemaConfirmacion = z
  .array(
    z.object({
      radicado: z.string().nullable(),
      nunc: z.string().nullable(),
      alias: z.string().nullable(),
      cliente: z.string().nullable(),
      etiquetas: z.array(z.string()).max(20),
    }),
  )
  .max(MAXIMO_FILAS_DE_IMPORTACION);

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function errorDeImportacion(error: unknown, operacion: string) {
  const estado = estadoDeError(error, operacion);
  return estado.tipo === 'error'
    ? {
        mensaje: estado.mensaje,
        ...(estado.codigoDeAyuda && { codigoDeAyuda: estado.codigoDeAyuda }),
      }
    : { mensaje: 'No pudimos completar la importación. Intenta de nuevo.' };
}

/**
 * Asistente de importación en dos pasos con un solo estado: si llega un archivo, prepara la
 * vista previa; si llega la confirmación, importa los procesos listos.
 */
export async function importarProcesosAccion(
  anterior: EstadoDeImportacion,
  formulario: FormData,
): Promise<EstadoDeImportacion> {
  const archivo = formulario.get('archivo');
  const confirmacion = formulario.get('procesos');

  try {
    const { casos, sesion, ip } = await contexto();
    if (!sesion.ok) return { tipo: 'error', ...errorDeImportacion(sesion.error, 'importar') };

    if (archivo instanceof File) {
      if (archivo.size === 0 && archivo.name === '') {
        return { tipo: 'error', mensaje: 'Elige el archivo de Excel o CSV con tus procesos.' };
      }
      const resultado = await casos.previsualizarImportacion(sesion.value, {
        nombre: archivo.name,
        tipo: archivo.type,
        contenido: new Uint8Array(await archivo.arrayBuffer()),
      });
      if (!resultado.ok)
        return { tipo: 'error', ...errorDeImportacion(resultado.error, 'importar') };
      const vista = resultado.value;
      return {
        tipo: 'vista-previa',
        vista: { ...vista, nombreArchivo: archivo.name.slice(0, 120) },
      };
    }

    if (typeof confirmacion === 'string' && anterior.tipo === 'vista-previa') {
      const filas = esquemaConfirmacion.safeParse(leerJson(confirmacion));
      const datos = filas.success
        ? filas.data.map((f) =>
            esquemaDatosDeProceso.safeParse({
              radicado: f.radicado ?? '',
              nunc: f.nunc ?? '',
              alias: f.alias ?? '',
              cliente: f.cliente ?? '',
              etiquetas: f.etiquetas,
            }),
          )
        : [];
      if (!filas.success || datos.some((d) => !d.success)) {
        return {
          ...anterior,
          error: { mensaje: 'Los datos a importar cambiaron. Vuelve a subir el archivo.' },
        };
      }
      const resultado = await casos.importarProcesos(sesion.value, {
        procesos: datos.flatMap((d) => (d.success ? [d.data] : [])),
        ip,
      });
      if (!resultado.ok)
        return { ...anterior, error: errorDeImportacion(resultado.error, 'importar') };
      refresh();
      return { tipo: 'importado', ...resultado.value };
    }
  } catch (error) {
    const detalle = errorDeImportacion(error, 'importar');
    return anterior.tipo === 'vista-previa'
      ? { ...anterior, error: detalle }
      : { tipo: 'error', ...detalle };
  }
  return { tipo: 'error', mensaje: 'Elige el archivo de Excel o CSV con tus procesos.' };
}
