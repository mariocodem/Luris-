import type { Metadata } from 'next';
import { clasesDeFuentes } from '@/shared/ui/fuentes';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LURIS', template: '%s · LURIS' },
  description: 'Consulta y seguimiento centralizado de procesos judiciales en Colombia.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-CO" className={`${clasesDeFuentes} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
