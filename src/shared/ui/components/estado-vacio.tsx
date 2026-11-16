import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estado vacío: dice qué aparecerá aquí y, si existe, la acción para empezar. Nunca un hueco
 * en blanco ni un «No hay datos» a secas. Puede llevar un ícono o un emblema propio (por
 * ejemplo, el sello de fecha oficial en Inicio).
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  ...visual
}: {
  readonly titulo: string;
  readonly descripcion: ReactNode;
  readonly accion?: ReactNode;
} & ({ readonly icono: LucideIcon } | { readonly emblema: ReactNode })) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-10 sm:items-center sm:px-10 sm:py-14 sm:text-center">
      {'emblema' in visual ? (
        visual.emblema
      ) : (
        <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <visual.icono className="size-5" aria-hidden />
        </span>
      )}
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-serif text-xl font-semibold">{titulo}</h2>
        <p className="text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
          {descripcion}
        </p>
      </div>
      {accion}
    </section>
  );
}
