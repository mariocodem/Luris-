import Link from 'next/link';
import { cn } from 'cn';
import { RadicadoCopiable } from '@/shared/ui/components/radicado-copiable';
import type { ItemDeConsultaMasiva } from '../application/puertos';
import {
  type ConteoDeItems,
  type EstadoDeItem,
  MENSAJE_DE_ITEM_ASISTIDO,
} from '../domain/consulta-masiva';
import { NOMBRES_DE_PLATAFORMA, type CodigoPlataforma } from '../domain/plataforma';
import { MarcaDeEstadoDeItem } from './marcas-de-consulta-masiva';
import { ReintentarItem, type AccionesDeConsultaMasiva } from './progreso-de-consulta-masiva';

export const FILTROS_DE_RESULTADOS = [
  'todos',
  'listos',
  'problemas',
  'confirmar',
  'pendientes',
] as const;
export type FiltroDeResultados = (typeof FILTROS_DE_RESULTADOS)[number];

const ESTADOS_DEL_FILTRO: Readonly<Record<FiltroDeResultados, readonly EstadoDeItem[] | null>> = {
  todos: null,
  listos: ['COMPLETADO'],
  problemas: ['FALLIDO'],
  confirmar: ['PENDIENTE_CONFIRMACION'],
  pendientes: ['PENDIENTE', 'EN_PROCESO'],
};

export function filtrarItems(
  items: readonly ItemDeConsultaMasiva[],
  filtro: FiltroDeResultados,
): readonly ItemDeConsultaMasiva[] {
  const estados = ESTADOS_DEL_FILTRO[filtro];
  return estados ? items.filter((i) => estados.includes(i.estado)) : items;
}

const cifras = new Intl.NumberFormat('es-CO');

/** Ruta de la consulta asistida de cada plataforma. */
const RUTA_ASISTIDA: Partial<Record<CodigoPlataforma, string>> = { SPOA: 'spoa' };

function Filtros({
  loteId,
  actual,
  conteo,
}: {
  readonly loteId: string;
  readonly actual: FiltroDeResultados;
  readonly conteo: ConteoDeItems;
}) {
  const opciones: { filtro: FiltroDeResultados; texto: string; cantidad: number }[] = [
    { filtro: 'todos', texto: 'Todos', cantidad: conteo.total },
    { filtro: 'listos', texto: 'Listos', cantidad: conteo.completados },
    { filtro: 'problemas', texto: 'Con problemas', cantidad: conteo.fallidos },
    { filtro: 'confirmar', texto: 'Esperan tu confirmación', cantidad: conteo.porConfirmar },
    { filtro: 'pendientes', texto: 'En curso', cantidad: conteo.pendientes + conteo.enProceso },
  ];
  return (
    <nav aria-label="Filtrar resultados" className="flex flex-wrap gap-2">
      {opciones
        .filter((o) => o.filtro === 'todos' || o.cantidad > 0 || o.filtro === actual)
        .map((o) => (
          <Link
            key={o.filtro}
            href={
              o.filtro === 'todos'
                ? `/consulta-masiva/${loteId}`
                : `/consulta-masiva/${loteId}?ver=${o.filtro}`
            }
            aria-current={o.filtro === actual ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
              o.filtro === actual
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {o.texto}
            <span className="cifras opacity-80">{cifras.format(o.cantidad)}</span>
          </Link>
        ))}
    </nav>
  );
}

function MensajeDelItem({ item }: { readonly item: ItemDeConsultaMasiva }) {
  if (item.estado === 'PENDIENTE_CONFIRMACION') return <>{MENSAJE_DE_ITEM_ASISTIDO}</>;
  if (item.resumen) return <>{item.resumen.mensaje}</>;
  return <span className="text-muted-foreground">Esperando su turno en la cola.</span>;
}

/**
 * Resultados por radicado y por plataforma (§7). Una sola estructura que en pantallas anchas se
 * ve como tabla y en móvil, como tarjetas.
 */
export function ResultadosDeConsultaMasiva({
  loteId,
  items,
  conteo,
  filtro,
  acciones,
}: {
  readonly loteId: string;
  readonly items: readonly ItemDeConsultaMasiva[];
  readonly conteo: ConteoDeItems;
  readonly filtro: FiltroDeResultados;
  readonly acciones: Pick<AccionesDeConsultaMasiva, 'reintentar'>;
}) {
  const visibles = filtrarItems(items, filtro);
  return (
    <section aria-labelledby="titulo-resultados" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 id="titulo-resultados" className="text-base font-semibold">
          Resultados
        </h2>
        <Filtros loteId={loteId} actual={filtro} conteo={conteo} />
      </div>
      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-sm text-muted-foreground">
          No hay consultas en este filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div
            aria-hidden
            className="hidden gap-4 bg-muted/60 px-5 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(17rem,1.2fr)_minmax(9.5rem,10rem)_minmax(0,1.6fr)_minmax(5.5rem,auto)]"
          >
            <span>Proceso</span>
            <span>Plataforma y estado</span>
            <span>Resultado</span>
            <span />
          </div>
          <ul className="divide-y divide-border" aria-label="Resultados de la consulta">
            {visibles.map((item) => {
              const rutaAsistida = RUTA_ASISTIDA[item.plataforma];
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-5 py-4 lg:grid lg:grid-cols-[minmax(17rem,1.2fr)_minmax(9.5rem,10rem)_minmax(0,1.6fr)_minmax(5.5rem,auto)] lg:items-center lg:gap-4"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {item.alias || item.cliente ? (
                      <span className="truncate text-sm font-medium">
                        {item.procesoId ? (
                          <Link
                            href={`/procesos/${item.procesoId}`}
                            className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {item.alias ?? item.cliente}
                          </Link>
                        ) : (
                          (item.alias ?? item.cliente)
                        )}
                      </span>
                    ) : null}
                    <RadicadoCopiable
                      valor={item.identificador}
                      tipo={item.tipo === 'NUNC' ? 'nunc' : 'radicado'}
                    />
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-sm text-muted-foreground lg:text-foreground">
                      {NOMBRES_DE_PLATAFORMA[item.plataforma]}
                    </span>
                    <MarcaDeEstadoDeItem estado={item.estado} />
                  </div>
                  <p className="text-sm text-pretty">
                    <MensajeDelItem item={item} />
                    {item.resumen?.nuevas ? (
                      <span className="mt-0.5 block text-muted-foreground">
                        <span className="cifras">{cifras.format(item.resumen.nuevas)}</span>{' '}
                        {item.resumen.nuevas === 1 ? 'actuación guardada' : 'actuaciones guardadas'}
                      </span>
                    ) : null}
                  </p>
                  <div className="flex lg:justify-end">
                    {item.estado === 'FALLIDO' && item.procesoId ? (
                      <ReintentarItem id={loteId} itemId={item.id} acciones={acciones} />
                    ) : null}
                    {item.estado === 'PENDIENTE_CONFIRMACION' && item.procesoId && rutaAsistida ? (
                      <Link
                        href={`/procesos/${item.procesoId}/${rutaAsistida}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Consultar
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
