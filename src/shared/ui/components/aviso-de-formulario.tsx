import type { EstadoDeFormulario } from '../estado-de-formulario';

/**
 * Mensaje general del formulario. Usa una región viva para que los lectores de pantalla lo
 * anuncien al aparecer; los errores son `alert`, las confirmaciones `status`.
 */
export function AvisoDeFormulario({ estado }: { readonly estado: EstadoDeFormulario }) {
  if (estado.tipo === 'inicial') return <div aria-live="polite" className="sr-only" />;
  const esError = estado.tipo === 'error';
  return (
    <div
      role={esError ? 'alert' : 'status'}
      className={
        esError
          ? 'rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'
          : 'rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground'
      }
    >
      <p>{estado.mensaje}</p>
      {esError && estado.codigoDeAyuda ? (
        <p className="mt-1 text-muted-foreground">
          Código de ayuda: <span className="font-mono font-medium">{estado.codigoDeAyuda}</span>
        </p>
      ) : null}
    </div>
  );
}
