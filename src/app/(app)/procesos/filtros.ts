import { z } from 'zod';
import {
  ESTADOS_DE_FILTRO,
  ORDENES_DE_PROCESOS,
  type FiltrosDeProcesos,
} from '@/modules/procesos/application/puertos';
import type { ValoresDeFiltro } from '@/modules/procesos/ui/barra-de-filtros';

/**
 * Filtros de la lista leídos de la URL. Un valor inválido (enlace viejo, edición a mano) vuelve
 * al predeterminado en vez de romper la página.
 */
const esquemaDeFiltros = z.object({
  q: z.string().trim().max(100).catch(''),
  estado: z.enum(ESTADOS_DE_FILTRO).catch('activos'),
  etiqueta: z.union([z.literal(''), z.uuid()]).catch(''),
  responsable: z.union([z.literal(''), z.literal('ninguno'), z.uuid()]).catch(''),
  orden: z.enum(ORDENES_DE_PROCESOS).catch('recientes'),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

type Parametros = Record<string, string | string[] | undefined>;

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function leerFiltros(parametros: Parametros): {
  readonly filtros: FiltrosDeProcesos;
  readonly valores: ValoresDeFiltro;
  readonly hayFiltros: boolean;
} {
  const datos = esquemaDeFiltros.parse({
    q: primero(parametros.q) ?? '',
    estado: primero(parametros.estado),
    etiqueta: primero(parametros.etiqueta) ?? '',
    responsable: primero(parametros.responsable) ?? '',
    orden: primero(parametros.orden),
    pagina: primero(parametros.pagina),
  });
  return {
    filtros: {
      texto: datos.q || null,
      estado: datos.estado,
      etiquetaId: datos.etiqueta || null,
      responsable: datos.responsable || null,
      orden: datos.orden,
      pagina: datos.pagina,
    },
    valores: {
      q: datos.q,
      estado: datos.estado,
      etiqueta: datos.etiqueta,
      responsable: datos.responsable,
      orden: datos.orden,
    },
    hayFiltros:
      datos.q !== '' ||
      datos.estado !== 'activos' ||
      datos.etiqueta !== '' ||
      datos.responsable !== '' ||
      datos.orden !== 'recientes',
  };
}

/** URL de la lista con los mismos filtros en otra página. */
export function urlDePagina(valores: ValoresDeFiltro, pagina: number): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) if (valor) parametros.set(clave, valor);
  if (pagina > 1) parametros.set('pagina', String(pagina));
  const consulta = parametros.toString();
  return consulta ? `/procesos?${consulta}` : '/procesos';
}
