import { Bell } from 'lucide-react';
import type { Metadata } from 'next';
import { formatearNumeroWhatsapp } from '@/modules/notificaciones/domain/preferencias';
import { FormularioDePreferencias } from '@/modules/notificaciones/ui/formulario-de-preferencias';
import { HistorialDeNotificaciones } from '@/modules/notificaciones/ui/historial-de-notificaciones';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { casosDeUso } from '../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../_servidor/sesion';
import { guardarPreferenciasAccion } from './acciones';

export const metadata: Metadata = { title: 'Notificaciones' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaDeNotificaciones() {
  const sesion = await sesionDeLaPeticion();
  const casos = casosDeUso();
  const [preferencias, avisos] = await Promise.all([
    casos.obtenerPreferenciasDeNotificacion(sesion),
    casos.listarNotificaciones(sesion),
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <Encabezado
        titulo="Notificaciones"
        descripcion="Los avisos de actuaciones nuevas que LURIS te envía por correo y WhatsApp, con la fecha de actuación y de registro que informa la plataforma judicial."
      />

      {preferencias.ok ? (
        <section aria-labelledby="titulo-preferencias" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-preferencias">Cómo quieres recibirlos</TituloDeSeccion>
          <FormularioDePreferencias
            accion={guardarPreferenciasAccion}
            email={preferencias.value.email}
            inicial={{
              correoActivo: preferencias.value.preferencias.correoActivo,
              whatsappActivo: preferencias.value.preferencias.whatsappActivo,
              numeroWhatsapp: preferencias.value.preferencias.numeroWhatsapp
                ? formatearNumeroWhatsapp(preferencias.value.preferencias.numeroWhatsapp)
                : '',
              frecuencia: preferencias.value.preferencias.frecuencia,
            }}
          />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">{preferencias.error.mensajeUsuario}</p>
      )}

      <section aria-labelledby="titulo-recientes" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-recientes">Avisos recientes</TituloDeSeccion>
        {avisos.ok && avisos.value.length > 0 ? (
          <HistorialDeNotificaciones avisos={avisos.value} />
        ) : (
          <EstadoVacio
            icono={Bell}
            titulo="Aún no tienes avisos"
            descripcion="Cuando haya una actuación nueva en tus procesos, la verás aquí y la recibirás por los canales que elegiste. Lo que LURIS trae en la primera consulta de un proceso es su historia: no se avisa."
          />
        )}
      </section>
    </div>
  );
}
