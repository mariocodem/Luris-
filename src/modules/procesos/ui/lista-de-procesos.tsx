import { Archive } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RadicadoCopiable } from '@/shared/ui/components/radicado-copiable';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import type { ResumenDeProceso } from '../application/puertos';
import { nombreDeProceso } from '../domain/proceso';

/** Fichas neutras de etiquetas (sin color: el color se reserva para lo nuevo y las acciones). */
export function ListaDeEtiquetas({ etiquetas }: { readonly etiquetas: readonly string[] }) {
  if (etiquetas.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Etiquetas">
      {etiquetas.map((nombre) => (
        <li
          key={nombre}
          className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {nombre}
        </li>
      ))}
    </ul>
  );
}

export function MarcaDeArchivado() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Archive className="size-3" aria-hidden />
      Archivado
    </span>
  );
}

/** Radicado y/o NUNC, cada uno con su botón de copiar. */
export function Identificadores({
  radicado,
  nunc,
}: {
  readonly radicado: string | null;
  readonly nunc: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {radicado ? <RadicadoCopiable valor={radicado} /> : null}
      {nunc ? (
        <span className="inline-flex items-center gap-1.5">
          {radicado ? <span className="text-xs text-muted-foreground">NUNC</span> : null}
          <RadicadoCopiable valor={nunc} tipo="nunc" />
        </span>
      ) : null}
    </div>
  );
}

function UltimaActuacion({ fecha }: { readonly fecha: Date | null }) {
  if (!fecha) return <span className="text-sm text-muted-foreground">Sin actuaciones aún</span>;
  return <SelloDeFecha etiqueta="Actuación" fecha={fecha} />;
}

function Responsable({ proceso }: { readonly proceso: ResumenDeProceso }) {
  return proceso.responsable ? (
    <span>{proceso.responsable.nombre}</span>
  ) : (
    <span className="text-muted-foreground">Sin responsable</span>
  );
}

function EnlaceAlProceso({
  proceso,
  children,
}: {
  readonly proceso: ResumenDeProceso;
  readonly children?: ReactNode;
}) {
  return (
    <Link
      href={`/procesos/${proceso.id}`}
      className="font-semibold text-foreground decoration-primary/40 underline-offset-4 hover:text-primary hover:underline"
    >
      {children ?? nombreDeProceso(proceso)}
    </Link>
  );
}

/**
 * Lista de procesos: tabla con columnas fijas desde 1024 px y tarjetas por debajo (§11). Las
 * fechas de actuación son las oficiales de la plataforma, con su sello.
 */
export function ListaDeProcesos({ procesos }: { readonly procesos: readonly ResumenDeProceso[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Procesos</caption>
          <thead className="bg-muted/60 text-left text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-5 py-3">
                Proceso
              </th>
              <th scope="col" className="px-5 py-3">
                Radicado / NUNC
              </th>
              <th scope="col" className="px-5 py-3">
                Responsable
              </th>
              <th scope="col" className="px-5 py-3">
                Última actuación
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {procesos.map((proceso) => (
              <tr key={proceso.id} className={proceso.activo ? '' : 'bg-muted/30'}>
                <td className="max-w-md px-5 py-4 align-top">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <EnlaceAlProceso proceso={proceso} />
                      {proceso.activo ? null : <MarcaDeArchivado />}
                    </div>
                    {proceso.cliente ? (
                      <p className="text-muted-foreground">{proceso.cliente}</p>
                    ) : null}
                    <ListaDeEtiquetas etiquetas={proceso.etiquetas} />
                  </div>
                </td>
                <td className="px-5 py-4 align-top">
                  <Identificadores radicado={proceso.radicado} nunc={proceso.nunc} />
                </td>
                <td className="px-5 py-4 align-top">
                  <Responsable proceso={proceso} />
                </td>
                <td className="px-5 py-4 align-top">
                  <UltimaActuacion fecha={proceso.ultimaActuacion} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 lg:hidden" aria-label="Procesos">
        {procesos.map((proceso) => (
          <li
            key={proceso.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <EnlaceAlProceso proceso={proceso} />
                {proceso.activo ? null : <MarcaDeArchivado />}
              </div>
              {proceso.cliente ? (
                <p className="text-sm text-muted-foreground">{proceso.cliente}</p>
              ) : null}
            </div>
            <div className="border-t border-border pt-3">
              <Identificadores radicado={proceso.radicado} nunc={proceso.nunc} />
            </div>
            <ListaDeEtiquetas etiquetas={proceso.etiquetas} />
            <div className="mt-auto flex items-end justify-between gap-3 text-sm">
              <Responsable proceso={proceso} />
              <UltimaActuacion fecha={proceso.ultimaActuacion} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
