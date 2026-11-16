'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from './components/sonner';
import { TooltipProvider } from './components/tooltip';

/**
 * Proveedores de interfaz para toda la aplicación:
 * - Tema claro / oscuro / sistema (clase `.dark` en <html>), aplicado antes de pintar para que
 *   no haya parpadeo, y sin transiciones durante el cambio.
 * - Tooltips con un retardo corto y consistente.
 * - Avisos emergentes (toasts) anunciados a los lectores de pantalla.
 */
export function Proveedores({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
