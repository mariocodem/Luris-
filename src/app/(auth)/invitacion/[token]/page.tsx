import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { nombreDelRol } from '@/modules/usuarios/application/correos';
import { casosDeUso } from '../../../_servidor/peticion';
import { FormularioDeAceptacion } from '../../formularios';

export const metadata: Metadata = { title: 'Invitación', referrer: 'no-referrer' };

async function Invitacion({
  params,
}: {
  readonly params: PageProps<'/invitacion/[token]'>['params'];
}) {
  const { token } = await params;
  await connection();
  const resultado = await casosDeUso().consultarInvitacion(token);

  if (!resultado.ok) {
    return (
      <>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Esta invitación no es válida</h1>
          <p className="text-pretty text-muted-foreground">{resultado.error.mensajeUsuario}</p>
        </header>
        <Link
          href="/iniciar-sesion"
          className="self-start rounded-sm text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Ir a iniciar sesión
        </Link>
      </>
    );
  }

  const invitacion = resultado.value;
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Únete a {invitacion.despachoNombre}
        </h1>
        <p className="text-pretty text-muted-foreground">
          Te invitaron como{' '}
          <strong className="text-foreground">{nombreDelRol(invitacion.rol)}</strong> con el correo{' '}
          <strong className="break-all text-foreground">{invitacion.email}</strong>.
        </p>
      </header>
      <FormularioDeAceptacion
        token={token}
        email={invitacion.email}
        yaTieneCuenta={invitacion.yaTieneCuenta}
      />
    </>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando la invitación">
      <div className="h-8 w-3/4 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default function PaginaDeInvitacion({ params }: PageProps<'/invitacion/[token]'>) {
  return (
    <Suspense fallback={<Cargando />}>
      <Invitacion params={params} />
    </Suspense>
  );
}
