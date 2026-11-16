import { FolderOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

export const metadata: Metadata = { title: 'Procesos' };

export default function PaginaDeProcesos() {
  return (
    <>
      <Encabezado
        titulo="Procesos"
        descripcion="Los procesos judiciales del despacho, con su radicado o NUNC, cliente, responsable y etiquetas."
      />
      <EstadoVacio
        icono={FolderOpen}
        titulo="Todavía no hay procesos registrados"
        descripcion="Muy pronto podrás registrar procesos uno a uno o importarlos desde Excel o CSV, con o sin guiones en el radicado."
      />
    </>
  );
}
