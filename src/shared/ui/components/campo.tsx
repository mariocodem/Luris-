import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from 'cn';

const CLASES_DE_CONTROL =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm';

interface PropsCampo {
  readonly etiqueta: string;
  readonly errores?: readonly string[];
  readonly ayuda?: ReactNode;
}

/**
 * Campo de formulario accesible: etiqueta asociada, ayuda y errores junto al campo, enlazados
 * con aria-describedby para los lectores de pantalla (§10, §11).
 */
export function Campo({
  etiqueta,
  errores = [],
  ayuda,
  className,
  ...props
}: PropsCampo & ComponentProps<'input'>) {
  const id = useId();
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = errores.length > 0 ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={errores.length > 0 || undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        className={cn(CLASES_DE_CONTROL, className)}
        {...props}
      />
      {ayuda ? (
        <p id={idAyuda} className="text-sm text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
      {idError ? (
        <ul id={idError} className="text-sm text-destructive">
          {errores.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Selector({
  etiqueta,
  errores = [],
  className,
  children,
  ...props
}: PropsCampo & ComponentProps<'select'>) {
  const id = useId();
  const idError = errores.length > 0 ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-invalid={errores.length > 0 || undefined}
        aria-describedby={idError}
        className={cn(CLASES_DE_CONTROL, 'pr-8', className)}
        {...props}
      >
        {children}
      </select>
      {idError ? (
        <ul id={idError} className="text-sm text-destructive">
          {errores.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
