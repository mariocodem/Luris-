import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

/** El documento no existe, aún no se descarga o la persona no puede ver su proceso. */
export default function DocumentoNoEncontrado() {
  return (
    <>
      <Encabezado titulo="Documento no encontrado" />
      <EstadoVacio
        icono={FileQuestion}
        titulo="No encontramos ese documento"
        descripcion="Puede que el enlace esté incompleto, que la plataforma aún no lo entregue o que no tengas asignado el proceso. Vuelve a la ficha del proceso para ver sus documentos disponibles."
        accion={
          <Button size="lg" asChild>
            <Link href="/procesos">Ir a los procesos</Link>
          </Button>
        }
      />
    </>
  );
}
