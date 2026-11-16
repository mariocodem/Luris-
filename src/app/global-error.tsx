'use client';

import { clasesDeFuentes } from '@/shared/ui/fuentes';
import { PantallaDeError } from '@/shared/ui/pantalla-de-error';
import { Proveedores } from '@/shared/ui/proveedores';
import './globals.css';

/** Reemplaza al layout raíz cuando este falla, por eso declara <html>, <body> y el tema. */
export default function ErrorGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es-CO" className={`${clasesDeFuentes} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <title>Algo salió mal · LURIS</title>
        <Proveedores>
          <PantallaDeError error={error} retry={retry} />
        </Proveedores>
      </body>
    </html>
  );
}
