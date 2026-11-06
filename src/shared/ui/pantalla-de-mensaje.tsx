import type { ReactNode } from 'react';

interface PropsPantallaDeMensaje {
  readonly titulo: string;
  readonly descripcion: string;
  readonly codigoDeAyuda?: string | undefined;
  readonly acciones: ReactNode;
}

/**
 * Pantalla completa para mensajes de estado (página no encontrada, errores).
 * Siempre en lenguaje humano y con al menos una acción para seguir.
 */
export function PantallaDeMensaje({
  titulo,
  descripcion,
  codigoDeAyuda,
  acciones,
}: PropsPantallaDeMensaje) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
        <p className="text-pretty text-muted-foreground">{descripcion}</p>
        {codigoDeAyuda ? (
          <p className="text-sm text-muted-foreground">
            Código de ayuda:{' '}
            <span className="font-mono font-medium text-foreground">{codigoDeAyuda}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">{acciones}</div>
    </main>
  );
}
