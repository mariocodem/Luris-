import type { Metadata } from 'next';
import { formatearDia } from '@/shared/domain/fechas';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import { sesionDeLaPeticion } from '../../_servidor/sesion';

export const metadata: Metadata = { title: 'Inicio' };

// Depende de la sesión en cada petición.
export const instant = false;

const horaEnBogota = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  hourCycle: 'h23',
});

/** Día de hoy en Bogotá como 'AAAA-MM-DD' (el formato en-CA es ISO). */
const isoEnBogota = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function saludo(ahora: Date): string {
  const hora = Number(horaEnBogota.format(ahora));
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default async function PaginaDeInicio() {
  const sesion = await sesionDeLaPeticion();
  const ahora = new Date();
  const nombre = sesion.nombre.split(' ')[0];

  return (
    <>
      <Encabezado
        titulo={`${saludo(ahora)}, ${nombre}`}
        descripcion={`${sesion.despacho?.nombre ?? ''} · ${formatearDia(ahora)}`}
      />
      <EstadoVacio
        emblema={
          // El sello es la marca de LURIS: aquí se muestra como ejemplo, rotulado como tal.
          <figure className="flex flex-col items-start gap-2 sm:items-center">
            <SelloDeFecha etiqueta="Registro" fecha={isoEnBogota.format(ahora)} estampar />
            <figcaption className="text-xs text-muted-foreground">
              Ejemplo: así verás la fecha oficial
            </figcaption>
          </figure>
        }
        titulo="Aquí verás las actuaciones nuevas"
        descripcion="Cuando registres los procesos del despacho, LURIS los consultará en la Rama Judicial, SPOA, SAMAI, SIUGJ y Tyba, y te mostrará cada actuación con la fecha en que la plataforma la registró, nunca la fecha en que LURIS la detectó."
      />
    </>
  );
}
