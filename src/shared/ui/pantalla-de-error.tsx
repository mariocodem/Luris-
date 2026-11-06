'use client';

import Link from 'next/link';
import { codigoDeAyudaDesde } from '@/shared/domain/codigo-de-ayuda';
import { Button } from '@/shared/ui/components/button';
import { PantallaDeMensaje } from '@/shared/ui/pantalla-de-mensaje';

interface PropsPantallaDeError {
  readonly error: unknown;
  readonly retry: () => void;
}

/**
 * Vista de los límites de error (`error.tsx`, `global-error.tsx`).
 * Nunca muestra el mensaje técnico del error; solo un código de ayuda que coincide con
 * el que `instrumentation.ts` escribe en el log del servidor.
 */
export function PantallaDeError({ error, retry }: PropsPantallaDeError) {
  return (
    <PantallaDeMensaje
      titulo="No pudimos mostrar esta página"
      descripcion="Algo salió mal de nuestro lado. Intenta de nuevo; si el problema sigue, escríbenos e incluye el código de ayuda."
      codigoDeAyuda={obtenerCodigoDeAyuda(error)}
      acciones={
        <>
          <Button onClick={retry}>Intentar de nuevo</Button>
          <Button variant="outline" asChild>
            <Link href="/">Ir al inicio</Link>
          </Button>
        </>
      }
    />
  );
}

/** Solo los errores del servidor traen `digest`; los del navegador no tienen registro que buscar. */
function obtenerCodigoDeAyuda(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'digest' in error) {
    const { digest } = error;
    if (typeof digest === 'string' && digest.length > 0) return codigoDeAyudaDesde(digest);
  }
  return undefined;
}
