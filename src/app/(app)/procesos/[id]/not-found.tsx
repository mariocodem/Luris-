import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

/**
 * El proceso no existe en el despacho o la persona no lo tiene asignado. Es el mismo mensaje en
 * los dos casos para no revelar procesos que no le corresponden.
 */
export default function ProcesoNoEncontrado() {
  return (
    <>
      <Encabezado titulo="Proceso no encontrado" />
      <EstadoVacio
        icono={FileQuestion}
        titulo="No encontramos ese proceso"
        descripcion="Puede que el enlace esté incompleto, que el proceso sea de otro despacho o que no lo tengas asignado. Si crees que deberías verlo, pide al administrador del despacho que te lo asigne."
        accion={
          <Button size="lg" asChild>
            <Link href="/procesos">Ir a los procesos</Link>
          </Button>
        }
      />
    </>
  );
}
