import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button } from '@/shared/ui/components/button';
import { cerrarSesionAccion } from '../acciones';

export const metadata: Metadata = { title: 'Sin acceso' };

const MENSAJES = {
  suspendido: {
    titulo: 'El acceso de tu despacho está suspendido',
    descripcion:
      'Mientras la suspensión siga vigente no es posible entrar a LURIS. Comunícate con nosotros para reactivarlo.',
  },
  cuenta: {
    titulo: 'Tu cuenta no tiene acceso a un despacho',
    descripcion:
      'Puede que el administrador de tu despacho haya desactivado tu cuenta. Habla con esa persona para que la revise.',
  },
} as const;

async function Mensaje({
  searchParams,
}: {
  readonly searchParams: PageProps<'/sin-acceso'>['searchParams'];
}) {
  const { motivo } = await searchParams;
  const { titulo, descripcion } = motivo === 'suspendido' ? MENSAJES.suspendido : MENSAJES.cuenta;
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
      <p className="text-pretty text-muted-foreground">{descripcion}</p>
    </header>
  );
}

export default function PaginaSinAcceso({ searchParams }: PageProps<'/sin-acceso'>) {
  return (
    <>
      <Suspense>
        <Mensaje searchParams={searchParams} />
      </Suspense>
      <form action={cerrarSesionAccion}>
        <Button type="submit" variant="outline" size="lg" className="h-10">
          Entrar con otra cuenta
        </Button>
      </form>
    </>
  );
}
