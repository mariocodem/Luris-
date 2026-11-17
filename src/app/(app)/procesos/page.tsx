import { FolderOpen, Plus, SearchX, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BarraDeFiltros } from '@/modules/procesos/ui/barra-de-filtros';
import { ListaDeProcesos } from '@/modules/procesos/ui/lista-de-procesos';
import { Paginacion } from '@/modules/procesos/ui/paginacion';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { casosDeUso } from '../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../_servidor/sesion';
import { leerFiltros, urlDePagina } from './filtros';

export const metadata: Metadata = { title: 'Procesos' };

// Depende de la sesión en cada petición.
export const instant = false;

const cifras = new Intl.NumberFormat('es-CO');

function AccionesDeRegistro() {
  return (
    <>
      <Button size="lg" asChild>
        <Link href="/procesos/nuevo">
          <Plus aria-hidden />
          Registrar proceso
        </Link>
      </Button>
      <Button size="lg" variant="outline" asChild>
        <Link href="/procesos/importar">
          <Upload aria-hidden />
          Importar
        </Link>
      </Button>
    </>
  );
}

export default async function PaginaDeProcesos({ searchParams }: PageProps<'/procesos'>) {
  const sesion = await sesionDeLaPeticion();
  const { filtros, valores, hayFiltros } = leerFiltros(await searchParams);
  const casos = casosDeUso();
  const [lista, opciones] = await Promise.all([
    casos.listarProcesos(sesion, filtros),
    casos.obtenerOpcionesDeProcesos(sesion),
  ]);

  if (!lista.ok || !opciones.ok) {
    const error = !lista.ok ? lista.error : !opciones.ok ? opciones.error : null;
    return <Encabezado titulo="Procesos" descripcion={error?.mensajeUsuario} />;
  }

  const { procesos, total, pagina, porPagina, soloPropios, puedeRegistrar } = lista.value;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const descripcion = soloPropios
    ? 'Los procesos en los que participas. Si falta alguno, pide al administrador del despacho que te lo asigne.'
    : 'Todos los procesos del despacho, con su radicado o NUNC, cliente, responsable y etiquetas.';

  if (total === 0 && !hayFiltros) {
    return (
      <>
        <Encabezado titulo="Procesos" descripcion={descripcion} />
        <EstadoVacio
          icono={FolderOpen}
          titulo={
            soloPropios ? 'Aún no tienes procesos asignados' : 'Todavía no hay procesos activos'
          }
          descripcion={
            puedeRegistrar
              ? 'Registra un proceso con su radicado o NUNC, o importa varios desde Excel o CSV. Los números pueden venir con o sin guiones.'
              : 'Cuando el administrador te asigne procesos, aparecerán aquí.'
          }
          accion={
            <div className="flex flex-wrap gap-2 sm:justify-center">
              {puedeRegistrar ? <AccionesDeRegistro /> : null}
              <Button size="lg" variant="ghost" asChild>
                <Link href="/procesos?estado=archivados">Ver archivados</Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  const responsables = opciones.value.miembros.filter((m) => m.rol !== 'asistente');

  return (
    <>
      <Encabezado
        titulo="Procesos"
        descripcion={descripcion}
        acciones={puedeRegistrar ? <AccionesDeRegistro /> : undefined}
      />

      <section aria-labelledby="titulo-lista" className="flex flex-col gap-4">
        <h2 id="titulo-lista" className="sr-only">
          Lista de procesos
        </h2>
        <BarraDeFiltros
          valores={valores}
          etiquetas={opciones.value.etiquetas}
          responsables={responsables}
          hayFiltros={hayFiltros}
        />

        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="cifras font-semibold text-foreground">{cifras.format(total)}</span>{' '}
          {total === 1 ? 'proceso' : 'procesos'}
          {hayFiltros ? ' con esta búsqueda' : ''}
        </p>

        {procesos.length > 0 ? (
          <ListaDeProcesos procesos={procesos} />
        ) : (
          <EstadoVacio
            icono={SearchX}
            titulo="Ningún proceso coincide"
            descripcion="Revisa lo que escribiste o quita algún filtro. Puedes buscar con una parte del radicado, con o sin guiones."
            accion={
              <Button variant="outline" asChild>
                <Link href="/procesos">Quitar búsqueda y filtros</Link>
              </Button>
            }
          />
        )}

        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          hrefAnterior={urlDePagina(valores, pagina - 1)}
          hrefSiguiente={urlDePagina(valores, pagina + 1)}
        />
      </section>
    </>
  );
}
