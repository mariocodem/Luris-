'use client';

import { CircleCheck, Info, LoaderCircle, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Avisos emergentes de LURIS (sonner adaptado a los tokens). Abajo al centro en móvil para no
 * tapar la navegación superior; abajo a la derecha en escritorio. Sonner los anuncia en una
 * región `aria-live`.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: 88 }}
      containerAriaLabel="Avisos"
      icons={{
        success: <CircleCheck className="size-4 text-exito" aria-hidden />,
        info: <Info className="size-4 text-primary" aria-hidden />,
        warning: <TriangleAlert className="size-4 text-alerta" aria-hidden />,
        error: <OctagonAlert className="size-4 text-destructive" aria-hidden />,
        loading: <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'font-sans text-sm shadow-flotante',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
