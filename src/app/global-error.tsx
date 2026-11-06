'use client';

import { clasesDeFuentes } from '@/shared/ui/fuentes';
import { PantallaDeError } from '@/shared/ui/pantalla-de-error';
import './globals.css';

/** Reemplaza al layout raíz cuando este falla, por eso declara <html> y <body>. */
export default function ErrorGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es-CO" className={`${clasesDeFuentes} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Algo salió mal · LURIS</title>
        <PantallaDeError error={error} retry={retry} />
      </body>
    </html>
  );
}
