import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

/**
 * La consulta masiva no existe en el despacho o es de otra persona. Es el mismo mensaje en los
 * dos casos para no revelar consultas ajenas.
 */
export default function ConsultaMasivaNoEncontrada() {
  return (
    <>
      <Encabezado titulo="Consulta masiva no encontrada" />
      <EstadoVacio
        icono={FileQuestion}
        titulo="No encontramos esa consulta"
        descripcion="Puede que el enlace esté incompleto o que la consulta sea de otra persona de tu despacho. Las consultas masivas solo las ve quien las hizo y el administrador."
        accion={
          <Button size="lg" asChild>
            <Link href="/consulta-masiva">Ir a la consulta masiva</Link>
          </Button>
        }
      />
    </>
  );
}
