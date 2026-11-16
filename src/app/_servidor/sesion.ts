import { cache } from 'react';
import { exigirSesion } from './peticion';

/**
 * Contexto de la sesión, leído una sola vez por petición aunque lo pidan el layout y la página.
 * Se vuelve a verificar en cada petición (no se guarda entre peticiones): un cambio de rol o una
 * desactivación surte efecto de inmediato.
 */
export const sesionDeLaPeticion = cache(exigirSesion);
