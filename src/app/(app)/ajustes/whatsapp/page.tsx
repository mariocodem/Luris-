import type { Metadata } from 'next';
import { VinculacionDeWhatsapp } from '@/modules/notificaciones/ui/vinculacion-de-whatsapp';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import {
  desvincularWhatsappAccion,
  estadoDeWhatsappAccion,
  vincularWhatsappAccion,
} from './acciones';

export const metadata: Metadata = { title: 'WhatsApp del despacho' };

// Depende de la sesión en cada petición.
export const instant = false;

const ACCIONES = {
  estado: estadoDeWhatsappAccion,
  vincular: vincularWhatsappAccion,
  desvincular: desvincularWhatsappAccion,
};

export default async function PaginaDeWhatsapp() {
  await sesionDeLaPeticion();
  const inicial = await estadoDeWhatsappAccion();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EnlaceDeRegreso href="/ajustes" texto="Ajustes" />
      <Encabezado
        titulo="WhatsApp del despacho"
        descripcion="Vincula un número dedicado para que LURIS avise por WhatsApp de las actuaciones nuevas a quienes lo aceptaron. Solo lo gestiona el administrador del despacho."
      />
      {inicial.ok ? (
        <VinculacionDeWhatsapp inicial={inicial.estado} acciones={ACCIONES} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {inicial.mensaje}
        </p>
      )}
    </div>
  );
}
