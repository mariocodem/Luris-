'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Confirma con un aviso (toast) una acción que terminó en otra página (p. ej. tras registrar un
 * proceso se llega a su ficha con `?aviso=registrado`). Luego limpia la URL para que recargar
 * no repita el aviso.
 */
export function AvisoDeLlegada({ mensaje }: { readonly mensaje: string | null }) {
  const router = useRouter();
  const ruta = usePathname();
  // Evita el aviso doble del efecto duplicado de React en desarrollo. No se usa un id fijo de
  // sonner: un id ya descartado no se vuelve a mostrar y se perdería el siguiente aviso.
  const mostrado = useRef<string | null>(null);

  useEffect(() => {
    if (!mensaje) {
      mostrado.current = null;
      return;
    }
    if (mostrado.current === mensaje) return;
    mostrado.current = mensaje;
    toast.success(mensaje);
    router.replace(ruta, { scroll: false });
  }, [mensaje, ruta, router]);

  return null;
}
