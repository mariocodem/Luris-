'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { cn } from 'cn';

const OPCIONES = [
  { valor: 'light', texto: 'Claro', Icono: Sun },
  { valor: 'dark', texto: 'Oscuro', Icono: Moon },
  { valor: 'system', texto: 'Sistema', Icono: Monitor },
] as const;

const suscribirNada = () => () => undefined;

/**
 * Interruptor claro / oscuro / sistema como grupo de opciones (radio). Hasta montar no sabe el
 * tema guardado, así que no marca ninguna opción para no mostrar un estado falso.
 */
export function SelectorDeTema({
  variante = 'superficie',
}: {
  readonly variante?: 'superficie' | 'barra-lateral';
}) {
  const { theme, setTheme } = useTheme();
  const montado = useSyncExternalStore(
    suscribirNada,
    () => true,
    () => false,
  );
  const enBarra = variante === 'barra-lateral';

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        'grid grid-cols-3 gap-1 rounded-lg p-1',
        enBarra ? 'bg-sidebar-accent' : 'bg-muted',
      )}
    >
      {OPCIONES.map(({ valor, texto, Icono }) => {
        const activo = montado && theme === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => setTheme(valor)}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1',
              enBarra
                ? activo
                  ? 'bg-white/[0.14] text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:text-sidebar-foreground'
                : activo
                  ? 'bg-card text-foreground shadow-elevado'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icono className="size-3.5" aria-hidden />
            {texto}
          </button>
        );
      })}
    </div>
  );
}
