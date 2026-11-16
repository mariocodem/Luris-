import type { Metadata, Viewport } from 'next';
import { clasesDeFuentes } from '@/shared/ui/fuentes';
import { Proveedores } from '@/shared/ui/proveedores';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LURIS', template: '%s · LURIS' },
  description: 'Consulta y seguimiento centralizado de procesos judiciales en Colombia.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16233f' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2a52' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // next-themes agrega la clase del tema antes de hidratar; la advertencia es esperada.
    <html lang="es-CO" className={`${clasesDeFuentes} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
