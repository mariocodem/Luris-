import { z } from 'zod';
import type { AppError } from '@/shared/domain/app-error';
import type { EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { registrarSiEsInesperado } from './peticion';

/** Lee un FormData como objeto plano de textos (para validarlo con Zod en la frontera). */
export function textosDe(formulario: FormData): Record<string, string> {
  const datos: Record<string, string> = {};
  for (const [clave, valor] of formulario.entries()) {
    if (typeof valor === 'string') datos[clave] = valor;
  }
  return datos;
}

/** Errores de Zod junto a cada campo, con los mensajes en español de los esquemas. */
export function estadoDeValidacion(
  error: z.ZodError,
  valores: Readonly<Record<string, string>> = {},
): EstadoDeFormulario {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return {
    tipo: 'error',
    mensaje: formErrors[0] ?? 'Revisa los campos marcados y vuelve a intentarlo.',
    errores: fieldErrors as Record<string, string[]>,
    valores,
  };
}

/** Convierte un error de dominio (o uno inesperado) en un estado de formulario seguro. */
export function estadoDeError(
  valor: AppError | unknown,
  operacion: string,
  valores: Readonly<Record<string, string>> = {},
): EstadoDeFormulario {
  const error = registrarSiEsInesperado(valor, operacion);
  const conCodigo = error.codigo === 'INESPERADO' || error.codigo === 'CORREO_NO_ENVIADO';
  return {
    tipo: 'error',
    mensaje: error.mensajeUsuario,
    ...(conCodigo && { codigoDeAyuda: error.codigoDeAyuda }),
    valores,
  };
}
