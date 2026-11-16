import type { ReactNode } from 'react';

interface PropsPantallaDeMensaje {
  readonly titulo: string;
  readonly descripcion: string;
  readonly codigoDeAyuda?: string | undefined;
  readonly acciones: ReactNode;
}

/**
 * Pantalla completa para mensajes de estado (página no encontrada, errores).
 * Siempre en lenguaje humano y con al menos una acción para seguir; nunca códigos HTTP ni
 * mensajes técnicos (§10).
 */
export function PantallaDeMensaje({
  titulo,
  descripcion,
  codigoDeAyuda,
  acciones,
}: PropsPantallaDeMensaje) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 px-4 py-16 sm:px-6">
      <p className="font-serif text-xl font-semibold tracking-[0.16em]">LURIS</p>
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[2rem]">
          {titulo}
        </h1>
        <p className="leading-relaxed text-pretty text-muted-foreground">{descripcion}</p>
        {codigoDeAyuda ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Código de ayuda:{' '}
            <span className="cifras rounded-md border border-border bg-card px-1.5 py-0.5 font-semibold text-foreground">
              {codigoDeAyuda}
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">{acciones}</div>
    </main>
  );
}
