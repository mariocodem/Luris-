import { ListChecks } from 'lucide-react';
import type { Metadata } from 'next';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

export const metadata: Metadata = { title: 'Consulta masiva' };

export default function PaginaDeConsultaMasiva() {
  return (
    <>
      <Encabezado
        titulo="Consulta masiva"
        descripcion="Consulta hasta 400 procesos en una sola operación y sigue el avance mientras haces otras cosas."
      />
      <EstadoVacio
        icono={ListChecks}
        titulo="Aún no has hecho consultas masivas"
        descripcion="Muy pronto podrás pegar una lista de radicados o subir un archivo, revisar el resumen antes de ejecutar y descargar los resultados en Excel."
      />
    </>
  );
}
