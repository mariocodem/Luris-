import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { FormularioDeNuevaContrasena } from '../../formularios';

export const metadata: Metadata = { title: 'Nueva contraseña', referrer: 'no-referrer' };

async function Formulario({
  params,
}: {
  readonly params: PageProps<'/restablecer-contrasena/[token]'>['params'];
}) {
  const { token } = await params;
  return <FormularioDeNuevaContrasena token={token} />;
}

export default function PaginaDeNuevaContrasena({
  params,
}: PageProps<'/restablecer-contrasena/[token]'>) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Elige una contraseña nueva</h1>
        <p className="text-pretty text-muted-foreground">
          Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.
        </p>
      </header>
      <Suspense>
        <Formulario params={params} />
      </Suspense>
      <Link
        href="/recuperar-contrasena"
        className="self-start rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Pedir un enlace nuevo
      </Link>
    </>
  );
}
