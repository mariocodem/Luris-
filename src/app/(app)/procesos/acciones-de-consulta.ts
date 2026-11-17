'use server';

import { z } from 'zod';
import type { VistaPreviaAsistida } from '@/modules/plataformas/application/consulta-asistida';
import type {
  AvanceDeConsulta,
  ConsultaSolicitada,
} from '@/modules/plataformas/application/solicitar-consulta';
import { CODIGOS_DE_PLATAFORMA } from '@/modules/plataformas/domain/plataforma';
import { esquemaId } from '@/modules/usuarios/domain/esquemas';
import { casosDeUso, ipDeLaPeticion, registrarSiEsInesperado } from '../../_servidor/peticion';

/**
 * Consultas a plataformas desde la ficha. «Consultar ahora» (Fase 5) corre en el worker: estas
 * acciones solo la encolan y leen su avance. La consulta asistida (Fase 6) lee y guarda el
 * resultado que pegó la persona. Cada una valida la entrada y deja que el caso de uso verifique
 * el permiso.
 */

export type RespuestaDeConsulta =
  | { readonly ok: true; readonly solicitadas: readonly ConsultaSolicitada[] }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export type RespuestaDeAvance =
  | { readonly ok: true; readonly avances: readonly AvanceDeConsulta[] }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

const NO_SE_PUDO = 'No pudimos iniciar la consulta. Recarga la página e inténtalo de nuevo.';

function fallo(valor: unknown, operacion: string) {
  const error = registrarSiEsInesperado(valor, operacion);
  return {
    ok: false as const,
    mensaje: error.mensajeUsuario,
    ...(error.codigo === 'INESPERADO' && { codigoDeAyuda: error.codigoDeAyuda }),
  };
}

export async function consultarAhoraAccion(procesoId: unknown): Promise<RespuestaDeConsulta> {
  const id = esquemaId.safeParse(procesoId);
  if (!id.success) return { ok: false, mensaje: NO_SE_PUDO };
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'consultar-ahora');
    const resultado = await casos.solicitarConsulta(sesion.value, id.data);
    if (!resultado.ok) return fallo(resultado.error, 'consultar-ahora');
    return { ok: true, solicitadas: resultado.value };
  } catch (error) {
    return fallo(error, 'consultar-ahora');
  }
}

const esquemaAvance = z.object({
  procesoId: esquemaId,
  solicitadas: z
    .array(z.object({ plataforma: z.enum(CODIGOS_DE_PLATAFORMA), idTrabajo: z.uuid() }))
    .min(1)
    .max(CODIGOS_DE_PLATAFORMA.length),
});

export async function avanceDeConsultaAccion(
  procesoId: unknown,
  solicitadas: unknown,
): Promise<RespuestaDeAvance> {
  const datos = esquemaAvance.safeParse({ procesoId, solicitadas });
  if (!datos.success) return { ok: false, mensaje: NO_SE_PUDO };
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'avance-de-consulta');
    const resultado = await casos.consultarAvance(
      sesion.value,
      datos.data.procesoId,
      datos.data.solicitadas,
    );
    if (!resultado.ok) return fallo(resultado.error, 'avance-de-consulta');
    return { ok: true, avances: resultado.value };
  } catch (error) {
    return fallo(error, 'avance-de-consulta');
  }
}

// ─── Consulta asistida (Fase 6) ───────────────────────────────────────────────

export type RespuestaDeLectura =
  | { readonly ok: true; readonly vista: VistaPreviaAsistida }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

export type RespuestaDeConfirmacion =
  | { readonly ok: true; readonly mensaje: string }
  | { readonly ok: false; readonly mensaje: string; readonly codigoDeAyuda?: string };

/** El resultado de una consulta cabe de sobra; más es otra cosa pegada por error. */
const LARGO_MAXIMO_DEL_TEXTO = 200_000;

const esquemaAsistida = z.object({
  procesoId: esquemaId,
  plataforma: z.enum(CODIGOS_DE_PLATAFORMA),
  texto: z
    .string()
    .max(
      LARGO_MAXIMO_DEL_TEXTO,
      'El texto pegado es demasiado largo. Copia solo el resultado de la consulta en el portal.',
    ),
});

function datosAsistidos(procesoId: unknown, plataforma: unknown, texto: unknown) {
  const datos = esquemaAsistida.safeParse({ procesoId, plataforma, texto });
  if (datos.success) return { ok: true as const, datos: datos.data };
  const sobreTexto = datos.error.issues.find((i) => i.path[0] === 'texto');
  return {
    ok: false as const,
    mensaje: sobreTexto?.code === 'too_big' ? sobreTexto.message : NO_SE_PUDO,
  };
}

/** Lee el texto pegado y devuelve lo que se guardaría, sin guardar nada. */
export async function interpretarConsultaAsistidaAccion(
  procesoId: unknown,
  plataforma: unknown,
  texto: unknown,
): Promise<RespuestaDeLectura> {
  const entrada = datosAsistidos(procesoId, plataforma, texto);
  if (!entrada.ok) return { ok: false, mensaje: entrada.mensaje };
  const { datos } = entrada;
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'leer-consulta-asistida');
    const vista = await casos.interpretarConsultaAsistida(
      sesion.value,
      datos.procesoId,
      datos.plataforma,
      datos.texto,
    );
    if (!vista.ok) return fallo(vista.error, 'leer-consulta-asistida');
    return { ok: true, vista: vista.value };
  } catch (error) {
    return fallo(error, 'leer-consulta-asistida');
  }
}

/** Guarda la consulta asistida que la persona revisó y confirmó. */
export async function confirmarConsultaAsistidaAccion(
  procesoId: unknown,
  plataforma: unknown,
  texto: unknown,
): Promise<RespuestaDeConfirmacion> {
  const entrada = datosAsistidos(procesoId, plataforma, texto);
  if (!entrada.ok) return { ok: false, mensaje: entrada.mensaje };
  const { datos } = entrada;
  try {
    const casos = casosDeUso();
    const sesion = await casos.obtenerContextoDeSesion();
    if (!sesion.ok) return fallo(sesion.error, 'confirmar-consulta-asistida');
    const resultado = await casos.confirmarConsultaAsistida(sesion.value, {
      ...datos,
      ip: await ipDeLaPeticion(),
    });
    if (!resultado.ok) return fallo(resultado.error, 'confirmar-consulta-asistida');
    return { ok: true, mensaje: resultado.value.mensaje };
  } catch (error) {
    return fallo(error, 'confirmar-consulta-asistida');
  }
}
