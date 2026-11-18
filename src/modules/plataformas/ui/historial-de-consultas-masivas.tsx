import Link from 'next/link';
import { formatearDiaYHora } from '@/shared/domain/fechas';
import type { ListaDeConsultasMasivas } from '../application/consulta-masiva';
import { porcentajeDeAvance } from '../domain/consulta-masiva';
import { MarcaDeEstadoDeLote } from './marcas-de-consulta-masiva';

const cifras = new Intl.NumberFormat('es-CO');

/** Consultas masivas recientes, para retomarlas: la consulta sigue aunque se cierre la página. */
export function HistorialDeConsultasMasivas({
  lista,
}: {
  readonly lista: ListaDeConsultasMasivas;
}) {
  if (lista.lotes.length === 0) return null;
  return (
    <section aria-labelledby="titulo-historial" className="flex flex-col gap-3">
      <h2 id="titulo-historial" className="text-base font-semibold">
        {lista.deTodoElDespacho ? 'Consultas masivas del despacho' : 'Tus consultas masivas'}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {lista.lotes.map((lote) => (
          <li key={lote.id}>
            <Link
              href={`/consulta-masiva/${lote.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  <span className="cifras">{cifras.format(lote.totalProcesos)}</span>{' '}
                  {lote.totalProcesos === 1 ? 'proceso' : 'procesos'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatearDiaYHora(lote.creadoEn)}
                  {lista.deTodoElDespacho ? ` · ${lote.creadaPorNombre}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <MarcaDeEstadoDeLote estado={lote.estado} />
                <span>
                  <span className="cifras text-foreground">
                    {cifras.format(lote.conteo.completados)}
                  </span>{' '}
                  listos
                  {lote.conteo.fallidos > 0 ? (
                    <>
                      {' · '}
                      <span className="cifras text-foreground">
                        {cifras.format(lote.conteo.fallidos)}
                      </span>{' '}
                      con problemas
                    </>
                  ) : null}
                </span>
                {lote.estado === 'EN_PROCESO' ? (
                  <span className="cifras">{porcentajeDeAvance(lote.conteo)} %</span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
