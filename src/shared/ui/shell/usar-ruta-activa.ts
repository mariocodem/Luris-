'use client';

import { usePathname } from 'next/navigation';
import type { EnlaceDeNavegacion } from './tipos';

/**
 * El enlace activo es el de prefijo más largo que coincide con la ruta, para que
 * `/ajustes/usuarios` active «Usuarios» y no también «Ajustes».
 */
export function useRutaActiva(enlaces: readonly EnlaceDeNavegacion[]): string | undefined {
  const ruta = usePathname();
  return enlaces
    .filter((e) => ruta === e.href || ruta.startsWith(`${e.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
