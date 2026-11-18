import { Download, ExternalLink, Eye, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { cn } from 'cn';
import { AgregarDocumento } from '@/modules/documentos/ui/agregar-documento';
import { etiquetaDeOrigen, URL_DE_DESCARGA_DE_TYBA } from '@/modules/plataformas/domain/tyba';
import { formatearFechaOficial } from '@/shared/domain/fechas';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import type { ActuacionDeProceso, DocumentoDeActuacion } from '../application/puertos';

/**
 * Línea de tiempo de actuaciones, la más reciente primero. Cada una muestra las fechas oficiales
 * de la plataforma con su sello (actuación y registro); la fecha de detección de LURIS nunca se
 * muestra como fecha de la actuación (§1.4). Las nuevas se marcan con el salmón del sistema.
 */
export function LineaDeTiempo({
  procesoId,
  actuaciones,
  total,
  puedeAgregarDocumentos = false,
}: {
  readonly procesoId: string;
  readonly actuaciones: readonly ActuacionDeProceso[];
  readonly total: number;
  /** Muestra «Agregar documento» (quien puede editar el proceso). */
  readonly puedeAgregarDocumentos?: boolean;
}) {
  // El despacho judicial solo aporta si el proceso pasó por más de uno (p. ej. juzgado y tribunal).
  const despachos = new Set(actuaciones.map((a) => a.despachoJudicial).filter(Boolean));
  const mostrarDespacho = despachos.size > 1;

  return (
    <div className="flex flex-col gap-3">
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {actuaciones.map((actuacion) => (
          <li
            key={actuacion.id}
            className={cn(
              'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:gap-6',
              actuacion.nueva && 'bg-nuevo-suave',
            )}
          >
            <div className="flex shrink-0 flex-wrap items-start gap-2 sm:w-[7.5rem] sm:flex-col">
              <SelloDeFecha
                etiqueta="Actuación"
                fecha={actuacion.fechaActuacion}
                estampar={actuacion.nueva}
              />
              {actuacion.fechaRegistro ? (
                <SelloDeFecha
                  etiqueta="Registro"
                  fecha={actuacion.fechaRegistro}
                  estampar={actuacion.nueva}
                />
              ) : (
                <span className="max-w-[7.5rem] text-xs text-muted-foreground">
                  La plataforma no informó la fecha de registro
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold text-pretty">
                {actuacion.nueva ? <span className="text-nuevo-texto">Nueva · </span> : null}
                {actuacion.descripcion}
              </p>
              {actuacion.anotacion ? (
                <p className="max-w-[68ch] text-sm leading-relaxed text-pretty text-muted-foreground">
                  {actuacion.anotacion}
                </p>
              ) : null}
              {actuacion.terminoInicia || actuacion.terminoVence ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Término: </span>
                  <Termino inicia={actuacion.terminoInicia} vence={actuacion.terminoVence} />
                </p>
              ) : null}
              {actuacion.documentos.length > 0 ? (
                <ListaDeDocumentos
                  procesoId={procesoId}
                  documentos={actuacion.documentos}
                  esDeTyba={actuacion.origen === 'TYBA'}
                />
              ) : null}
              {puedeAgregarDocumentos ? (
                <div>
                  <AgregarDocumento procesoId={procesoId} actuacionId={actuacion.id} />
                </div>
              ) : null}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{etiquetaDeOrigen(actuacion.plataforma, actuacion.origen)}</span>
                {mostrarDespacho && actuacion.despachoJudicial ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{actuacion.despachoJudicial}</span>
                  </>
                ) : null}
                {actuacion.tieneDocumentos && actuacion.documentos.length === 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden />
                      Con documentos, obteniéndolos
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {total > actuaciones.length ? (
        <p className="text-sm text-muted-foreground">
          Se muestran las <span className="cifras">{actuaciones.length}</span> actuaciones más
          recientes de <span className="cifras">{total}</span>.
        </p>
      ) : null}
    </div>
  );
}

function Termino({ inicia, vence }: { readonly inicia: Date | null; readonly vence: Date | null }) {
  if (inicia && vence && inicia.getTime() === vence.getTime()) {
    return <span className="cifras">el {formatearFechaOficial(vence)}</span>;
  }
  if (inicia && vence) {
    return (
      <span className="cifras">
        del {formatearFechaOficial(inicia)} al {formatearFechaOficial(vence)}
      </span>
    );
  }
  if (vence) return <span className="cifras">vence el {formatearFechaOficial(vence)}</span>;
  return inicia ? <span className="cifras">inicia el {formatearFechaOficial(inicia)}</span> : null;
}

function ListaDeDocumentos({
  procesoId,
  documentos,
  esDeTyba,
}: {
  readonly procesoId: string;
  readonly documentos: readonly DocumentoDeActuacion[];
  readonly esDeTyba: boolean;
}) {
  const sinDescargar = esDeTyba && documentos.some((d) => d.estado === 'NO_DISPONIBLE');
  return (
    <ul className="mt-1 flex flex-col gap-1.5" aria-label="Documentos de la actuación">
      {documentos.map((documento) => (
        <li key={documento.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="break-all">{documento.nombre}</span>
          </span>
          {documento.estado === 'DESCARGADO' ? (
            <span className="inline-flex items-center gap-3">
              {documento.visibleEnLinea ? (
                <Link
                  href={`/procesos/${procesoId}/documentos/${documento.id}`}
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  <Eye className="size-3.5" aria-hidden />
                  Ver
                </Link>
              ) : null}
              <a
                href={`/api/documentos/${documento.id}?descargar=1`}
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              >
                <Download className="size-3.5" aria-hidden />
                Descargar
              </a>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {documento.estado === 'PENDIENTE'
                ? 'Obteniéndolo de la plataforma…'
                : 'La plataforma no lo tiene disponible por ahora'}
            </span>
          )}
        </li>
      ))}
      {sinDescargar ? <AyudaDeDescargaEnTyba /> : null}
    </ul>
  );
}

/**
 * Tyba entrega los documentos por una página con CAPTCHA, y LURIS no resuelve retos (§6): la
 * persona los descarga ella y los agrega a la actuación con «Agregar documento».
 */
function AyudaDeDescargaEnTyba() {
  return (
    <li className="mt-1 flex max-w-[68ch] flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-pretty">
      <span>
        Puedes descargarlo en Tyba con el <strong>número de certificación</strong> que viene en la
        comunicación del juzgado y el radicado como código del proceso. Luego súbelo aquí con
        «Agregar documento».
      </span>
      <a
        href={URL_DE_DESCARGA_DE_TYBA}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-3.5" aria-hidden />
        Abrir la descarga de Tyba
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    </li>
  );
}
