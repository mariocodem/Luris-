import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Grupo de opciones marcables como fichas (etiquetas, personas). Son casillas nativas: se
 * navegan con teclado y se envían con el formulario sin JavaScript.
 */
export function OpcionesMarcables({
  leyenda,
  name,
  opciones,
  marcadas,
  ayuda,
}: {
  readonly leyenda: string;
  readonly name: string;
  readonly opciones: readonly { readonly valor: string; readonly texto: ReactNode }[];
  readonly marcadas: ReadonlySet<string>;
  readonly ayuda?: ReactNode;
}) {
  if (opciones.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{leyenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <label
            key={opcion.valor}
            className="group inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm text-foreground transition-colors select-none hover:bg-muted has-checked:border-primary/40 has-checked:bg-secondary has-checked:text-secondary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <input
              type="checkbox"
              name={name}
              value={opcion.valor}
              defaultChecked={marcadas.has(opcion.valor)}
              className="sr-only"
            />
            <Check className="hidden size-3.5 group-has-checked:block" aria-hidden />
            {opcion.texto}
          </label>
        ))}
      </div>
      {ayuda ? <p className="text-sm text-muted-foreground">{ayuda}</p> : null}
    </fieldset>
  );
}
