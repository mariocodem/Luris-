import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/shared/ui/components/button';
import { PantallaDeMensaje } from '@/shared/ui/pantalla-de-mensaje';

export const metadata: Metadata = { title: 'Página no encontrada' };

export default function NoEncontrado() {
  return (
    <PantallaDeMensaje
      titulo="No encontramos esta página"
      descripcion="Puede que el enlace esté incompleto o que la página ya no exista. Revisa la dirección o vuelve al inicio."
      acciones={
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      }
    />
  );
}
