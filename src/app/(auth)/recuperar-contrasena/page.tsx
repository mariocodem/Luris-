import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioDeRecuperacion } from '../formularios';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function PaginaDeRecuperacion() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Recupera tu contraseña</h1>
        <p className="text-pretty text-muted-foreground">
          Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
        </p>
      </header>
      <FormularioDeRecuperacion />
      <Link
        href="/iniciar-sesion"
        className="self-start rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Volver a iniciar sesión
      </Link>
    </>
  );
}
