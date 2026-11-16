import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FormularioDeInicioDeSesion } from '../formularios';

export const metadata: Metadata = { title: 'Iniciar sesión' };

async function AvisoDeContrasenaActualizada({
  searchParams,
}: {
  readonly searchParams: PageProps<'/iniciar-sesion'>['searchParams'];
}) {
  const { contrasena } = await searchParams;
  if (contrasena !== 'actualizada') return null;
  return (
    <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
      Tu contraseña se actualizó. Inicia sesión con la nueva.
    </p>
  );
}

export default function PaginaDeInicioDeSesion({ searchParams }: PageProps<'/iniciar-sesion'>) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inicia sesión</h1>
        <p className="text-pretty text-muted-foreground">
          Entra con el correo y la contraseña de tu cuenta del despacho.
        </p>
      </header>
      <Suspense>
        <AvisoDeContrasenaActualizada searchParams={searchParams} />
      </Suspense>
      <FormularioDeInicioDeSesion />
      <p className="text-sm text-pretty text-muted-foreground">
        ¿Aún no tienes cuenta? Las cuentas se crean por invitación: pídela al administrador de tu
        despacho.
      </p>
    </>
  );
}
