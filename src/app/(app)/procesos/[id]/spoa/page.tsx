import { Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConsultaAsistida } from '@/modules/plataformas/ui/consulta-asistida';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../../_servidor/sesion';
import {
  confirmarConsultaAsistidaAccion,
  interpretarConsultaAsistidaAccion,
} from '../../acciones-de-consulta';

export const metadata: Metadata = { title: 'Consultar en el SPOA' };

// Depende de la sesión en cada petición.
export const instant = false;

/**
 * Consulta asistida del SPOA (Fase 6): el portal de la Fiscalía exige resolver un reto, así que
 * la persona consulta allí y LURIS lee y guarda el resultado que ella pega (§6).
 */
export default async function PaginaDeConsultaEnSpoa({ params }: PageProps<'/procesos/[id]/spoa'>) {
  const sesion = await sesionDeLaPeticion();
  const { id } = await params;
  const consulta = await casosDeUso().prepararConsultaAsistida(sesion, id, 'SPOA');
  if (!consulta.ok && consulta.error.codigo === 'NO_ENCONTRADO') notFound();

  return (
    <>
      <div className="flex flex-col gap-4">
        <EnlaceDeRegreso href={`/procesos/${id}`} texto="Ficha del proceso" />
        <Encabezado
          titulo="Consultar en el SPOA"
          descripcion={
            consulta.ok
              ? `${consulta.value.nombre}. El portal de la Fiscalía pide resolver un reto: la consulta la haces tú y LURIS guarda el resultado.`
              : undefined
          }
        />
      </div>
      {consulta.ok ? (
        <ConsultaAsistida
          procesoId={consulta.value.procesoId}
          plataforma="SPOA"
          numero={consulta.value.numero}
          nombreDelPortal="Portal «Consulta su denuncia» de la Fiscalía"
          urlDelPortal={consulta.value.urlDelPortal}
          acciones={{
            interpretar: interpretarConsultaAsistidaAccion,
            confirmar: confirmarConsultaAsistidaAccion,
          }}
        />
      ) : (
        <div className="flex max-w-[60ch] flex-col items-start gap-4">
          <p className="text-pretty text-muted-foreground">{consulta.error.mensajeUsuario}</p>
          {consulta.error.codigo === 'SIN_IDENTIFICADOR' ? (
            <Button variant="outline" size="lg" asChild>
              <Link href={`/procesos/${id}/editar`}>
                <Pencil aria-hidden />
                Editar el proceso
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}
