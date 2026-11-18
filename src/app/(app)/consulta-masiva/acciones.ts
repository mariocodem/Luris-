'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { AvanceDeConsultaMasiva } from '@/modules/plataformas/application/consulta-masiva';
import { MAXIMO_DE_CONSULTA_MASIVA } from '@/modules/plataformas/domain/consulta-masiva';
import type { EstadoDeConsultaMasiva } from '@/modules/plataformas/ui/estado-de-consulta-masiva';
import { TAMANO_MAXIMO_DE_ARCHIVO } from '@/modules/procesos/infrastructure/lector-de-tablas';
import { esquemaId } from '@/modules/usuarios/domain/esquemas';
import { casosDeUso, ipDeLaPeticion, registrarSiEsInesperado } from '../../_servidor/peticion';

/**
 * Acciones de la consulta masiva. Cada una valida la entrada con Zod, vuelve a leer la sesión y
 * deja que el caso de uso verifique el permiso y el acceso a cada proceso (§5, §7).
 */

/** Más texto del que caben 400 radicados con holgura: evita enviar documentos enormes. */
const MAXIMO_DE_TEXTO = 200_000;

function detalleDeError(valor: unknown, operacion: string) {
  const error = registrarSiEsInesperado(valor, operacion);
  return {
    mensaje: error.mensajeUsuario,
    ...(error.codigo === 'INESPERADO' && { codigoDeAyuda: error.codigoDeAyuda }),
  };
}

const esquemaConfirmacion = z
  .array(z.string().regex(/^\d{21}$|^\d{23}$/))
  .min(1)
  .max(MAXIMO_DE_CONSULTA_MASIVA);

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/**
 * Asistente en dos pasos con un solo estado: si llegan números (texto o archivo), prepara el
 * resumen; si llega la confirmación, crea la consulta y lleva a su página de avance.
 */
export async function consultaMasivaAccion(
  anterior: EstadoDeConsultaMasiva,
  formulario: FormData,
): Promise<EstadoDeConsultaMasiva> {
  const confirmacion = formulario.get('identificadores');
  const texto = formulario.get('texto');
  const archivo = formulario.get('archivo');
  let nuevaConsultaId: string | null = null;

  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return { tipo: 'error', ...detalleDeError(sesion.error, 'consulta-masiva') };

    if (typeof confirmacion === 'string' && anterior.tipo === 'vista-previa') {
      const identificadores = esquemaConfirmacion.safeParse(leerJson(confirmacion));
      if (!identificadores.success) {
        return {
          ...anterior,
          error: { mensaje: 'La lista cambió. Vuelve a revisarla antes de consultar.' },
        };
      }
      const resultado = await casos.iniciarConsultaMasiva(sesion.value, {
        identificadores: identificadores.data,
        ip: await ipDeLaPeticion(),
      });
      if (!resultado.ok) {
        return { ...anterior, error: detalleDeError(resultado.error, 'consulta-masiva') };
      }
      nuevaConsultaId = resultado.value.id;
    } else {
      // Sin elegir archivo, el navegador envía uno vacío (a veces con nombre).
      const hayArchivo = archivo instanceof File && archivo.size > 0;
      const textoPegado = typeof texto === 'string' ? texto : '';
      if (textoPegado.length > MAXIMO_DE_TEXTO) {
        return { tipo: 'error', mensaje: 'El texto es demasiado largo. Pega solo los radicados.' };
      }
      if (hayArchivo && archivo.size > TAMANO_MAXIMO_DE_ARCHIVO) {
        return {
          tipo: 'error',
          mensaje: 'El archivo pesa más de 1 MB. Divídelo en varios archivos más pequeños.',
        };
      }
      const resultado = await casos.previsualizarConsultaMasiva(sesion.value, {
        texto: textoPegado.trim() === '' ? null : textoPegado,
        archivo: hayArchivo
          ? {
              nombre: archivo.name,
              tipo: archivo.type,
              contenido: new Uint8Array(await archivo.arrayBuffer()),
            }
          : null,
      });
      if (!resultado.ok) {
        return { tipo: 'error', ...detalleDeError(resultado.error, 'consulta-masiva') };
      }
      return {
        tipo: 'vista-previa',
        vista: resultado.value,
        origen: hayArchivo ? archivo.name.slice(0, 120) : 'Texto pegado',
      };
    }
  } catch (error) {
    const detalle = detalleDeError(error, 'consulta-masiva');
    return anterior.tipo === 'vista-previa'
      ? { ...anterior, error: detalle }
      : { tipo: 'error', ...detalle };
  }

  // Fuera del try: redirect lanza una excepción propia de Next.js.
  refresh();
  redirect(`/consulta-masiva/${nuevaConsultaId}`);
}

export type RespuestaDeAvanceMasivo =
  | { readonly ok: true; readonly avance: AvanceDeConsultaMasiva }
  | { readonly ok: false; readonly mensaje: string };

/** Lo que consulta la barra de progreso cada pocos segundos. */
export async function avanceDeConsultaMasivaAccion(id: unknown): Promise<RespuestaDeAvanceMasivo> {
  const consultaId = esquemaId.safeParse(id);
  if (!consultaId.success) return { ok: false, mensaje: 'No encontramos esa consulta masiva.' };
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok)
      return { ok: false, mensaje: detalleDeError(sesion.error, 'avance-masivo').mensaje };
    const resultado = await casos.consultarAvanceDeConsultaMasiva(sesion.value, consultaId.data);
    return resultado.ok
      ? { ok: true, avance: resultado.value }
      : { ok: false, mensaje: detalleDeError(resultado.error, 'avance-masivo').mensaje };
  } catch (error) {
    return { ok: false, mensaje: detalleDeError(error, 'avance-masivo').mensaje };
  }
}

export type RespuestaDeReintento =
  | { readonly ok: true; readonly reintentados: number }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export async function reintentarConsultaMasivaAccion(
  id: unknown,
  itemId: unknown = null,
): Promise<RespuestaDeReintento> {
  const datos = z
    .object({ id: esquemaId, itemId: esquemaId.nullable() })
    .safeParse({ id, itemId: itemId ?? null });
  if (!datos.success) return { ok: false, mensaje: 'No encontramos esa consulta masiva.' };
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return { ok: false, ...detalleDeError(sesion.error, 'reintentar-masiva') };
    const resultado = await casos.reintentarConsultaMasiva(sesion.value, {
      ...datos.data,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok)
      return { ok: false, ...detalleDeError(resultado.error, 'reintentar-masiva') };
    refresh();
    return { ok: true, reintentados: resultado.value.reintentados };
  } catch (error) {
    return { ok: false, ...detalleDeError(error, 'reintentar-masiva') };
  }
}
