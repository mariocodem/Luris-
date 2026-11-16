import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * Encabezado de página: título en serif (el tono formal de LURIS), descripción opcional y
 * acciones a la derecha en escritorio, debajo en móvil.
 */
export function Encabezado({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  readonly titulo: ReactNode;
  readonly descripcion?: ReactNode;
  readonly acciones?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-serif text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[2rem]">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
            {descripcion}
          </p>
        ) : null}
      </div>
      {acciones ? <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div> : null}
    </header>
  );
}

/** Título de sección dentro de una página. */
export function TituloDeSeccion({
  id,
  children,
  detalle,
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly detalle?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-base font-semibold tracking-[-0.005em]">
        {children}
      </h2>
      {detalle ? <span className="text-sm text-muted-foreground">{detalle}</span> : null}
    </div>
  );
}
