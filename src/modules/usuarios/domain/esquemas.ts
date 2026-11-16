import { z } from 'zod';
import { ROLES_DE_DESPACHO } from './rol-de-despacho';

/** Esquemas reutilizables de cuentas (formularios, server actions y casos de uso). */

export const LONGITUD_MINIMA_CONTRASENA = 10;
export const LONGITUD_MAXIMA_CONTRASENA = 128;

export const esquemaEmail = z
  .string({ error: 'Escribe tu correo electrónico.' })
  .trim()
  .min(1, 'Escribe tu correo electrónico.')
  .max(320, 'El correo es demasiado largo.')
  .pipe(z.email({ error: 'Revisa el correo: debe tener la forma nombre@dominio.com.' }))
  .transform((email) => email.toLowerCase());

export const esquemaContrasena = z
  .string({ error: 'Escribe una contraseña.' })
  .min(
    LONGITUD_MINIMA_CONTRASENA,
    `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
  )
  .max(
    LONGITUD_MAXIMA_CONTRASENA,
    `La contraseña puede tener máximo ${LONGITUD_MAXIMA_CONTRASENA} caracteres.`,
  )
  .refine((clave) => clave.trim().length > 0, 'La contraseña no puede ser solo espacios.');

/** Para iniciar sesión no se exigen reglas de formato: solo que no esté vacía. */
export const esquemaContrasenaActual = z
  .string({ error: 'Escribe tu contraseña.' })
  .min(1, 'Escribe tu contraseña.')
  .max(LONGITUD_MAXIMA_CONTRASENA, 'La contraseña es demasiado larga.');

export const esquemaNombre = z
  .string({ error: 'Escribe el nombre.' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 letras.')
  .max(200, 'El nombre puede tener máximo 200 caracteres.');

export const esquemaRol = z.enum(ROLES_DE_DESPACHO, {
  error: 'Elige un rol: administrador, abogado o asistente.',
});

export const esquemaId = z.uuid({ error: 'El identificador no es válido.' });
