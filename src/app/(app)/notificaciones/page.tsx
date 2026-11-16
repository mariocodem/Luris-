import { Bell } from 'lucide-react';
import type { Metadata } from 'next';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';

export const metadata: Metadata = { title: 'Notificaciones' };

export default function PaginaDeNotificaciones() {
  return (
    <>
      <Encabezado
        titulo="Notificaciones"
        descripcion="Los avisos de actuaciones nuevas que LURIS te envía por correo y WhatsApp."
      />
      <EstadoVacio
        icono={Bell}
        titulo="No tienes notificaciones"
        descripcion="Cuando haya una actuación nueva en tus procesos, te avisaremos con la fecha de actuación y de registro oficiales. Podrás elegir recibirlas de inmediato o en un resumen diario."
      />
    </>
  );
}
