import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/shared/ui/components/button';

/** Navegación entre páginas de resultados; los enlaces conservan la búsqueda y los filtros. */
export function Paginacion({
  pagina,
  totalPaginas,
  hrefAnterior,
  hrefSiguiente,
}: {
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly hrefAnterior: string;
  readonly hrefSiguiente: string;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <nav aria-label="Páginas de resultados" className="flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Button variant="outline" asChild>
          <Link href={hrefAnterior} rel="prev">
            <ChevronLeft aria-hidden />
            Anterior
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        Página <span className="cifras text-foreground">{pagina}</span> de{' '}
        <span className="cifras text-foreground">{totalPaginas}</span>
      </p>
      {pagina < totalPaginas ? (
        <Button variant="outline" asChild>
          <Link href={hrefSiguiente} rel="next">
            Siguiente
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
