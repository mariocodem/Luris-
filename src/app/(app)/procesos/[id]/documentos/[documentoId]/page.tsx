import { Download, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../../../_servidor/sesion';

export const metadata: Metadata = { title: 'Documento' };

// Depende de la sesión en cada petición.
export const instant = false;

/**
 * Visor de un documento de una actuación (§8): PDF e imágenes dentro de LURIS, con descarga.
 * El archivo llega por la ruta autenticada /api/documentos/[id], nunca por una URL pública.
 */
export default async function PaginaDeDocumento({
  params,
}: PageProps<'/procesos/[id]/documentos/[documentoId]'>) {
  const sesion = await sesionDeLaPeticion();
  const { id, documentoId } = await params;
  const documento = await casosDeUso().abrirDocumento(sesion, documentoId);
  if (!documento.ok || documento.value.procesoId !== id) notFound();

  const { nombre, tipo } = documento.value;
  const archivo = `/api/documentos/${documentoId}`;
  return (
    <>
      <div className="flex flex-col gap-4">
        <EnlaceDeRegreso href={`/procesos/${id}`} texto="Ficha del proceso" />
        <Encabezado
          titulo={nombre}
          acciones={
            <Button size="lg" asChild>
              <a href={`${archivo}?descargar=1`}>
                <Download aria-hidden />
                Descargar
              </a>
            </Button>
          }
        />
      </div>

      {tipo.mime === 'application/pdf' ? (
        <div className="flex flex-col gap-3">
          <iframe
            src={archivo}
            title={`Documento: ${nombre}`}
            className="h-[75dvh] min-h-[28rem] w-full rounded-xl border border-border bg-card"
          />
          <p className="text-sm text-muted-foreground">
            ¿No se ve el documento en tu teléfono?{' '}
            <a
              href={archivo}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              Ábrelo en una pestaña nueva
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </p>
        </div>
      ) : tipo.visibleEnLinea ? (
        <div className="overflow-auto rounded-xl border border-border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por una ruta autenticada; no pasa por el optimizador de imágenes */}
          <img src={archivo} alt={`Documento: ${nombre}`} className="mx-auto h-auto max-w-full" />
        </div>
      ) : (
        <p className="text-muted-foreground">
          Este formato no se puede mostrar dentro de LURIS. Descárgalo para abrirlo en tu equipo.
        </p>
      )}
    </>
  );
}
