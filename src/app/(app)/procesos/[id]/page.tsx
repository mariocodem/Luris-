import { CalendarClock, Pencil, ScanText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DESCRIPCION_DE_ESTADO,
  NOMBRE_EN_FRASE,
  NOMBRES_DE_PLATAFORMA,
} from '@/modules/plataformas/domain/plataforma';
import { ConsultarAhora } from '@/modules/plataformas/ui/consultar-ahora';
import { DatosDeLaPlataforma } from '@/modules/plataformas/ui/datos-de-la-plataforma';
import { nombreDeProceso } from '@/modules/procesos/domain/proceso';
import { ControlDeArchivo, PanelDeAsignaciones } from '@/modules/procesos/ui/controles-de-proceso';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { LineaDeTiempo } from '@/modules/procesos/ui/linea-de-tiempo';
import {
  Identificadores,
  ListaDeEtiquetas,
  MarcaDeArchivado,
} from '@/modules/procesos/ui/lista-de-procesos';
import { formatearDia, formatearDiaYHora } from '@/shared/domain/fechas';
import { AvisoDeLlegada } from '@/shared/ui/aviso-de-llegada';
import { Button } from '@/shared/ui/components/button';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import {
  agregarAsignadoAccion,
  asignarResponsableAccion,
  cambiarEstadoDeProcesoAccion,
  quitarAsignadoAccion,
} from '../acciones';
import { avanceDeConsultaAccion, consultarAhoraAccion } from '../acciones-de-consulta';

export const metadata: Metadata = { title: 'Ficha del proceso' };

// Depende de la sesión en cada petición.
export const instant = false;

const AVISOS: Readonly<Record<string, string>> = {
  registrado: 'Proceso registrado.',
  editado: 'Cambios guardados.',
};

export default async function PaginaDelProceso({
  params,
  searchParams,
}: PageProps<'/procesos/[id]'>) {
  const sesion = await sesionDeLaPeticion();
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const casos = casosDeUso();
  const ficha = await casos.consultarProceso(sesion, id);
  if (!ficha.ok) {
    if (ficha.error.codigo === 'NO_ENCONTRADO') notFound();
    return <Encabezado titulo="Proceso" descripcion={ficha.error.mensajeUsuario} />;
  }

  const { proceso, permisos } = ficha.value;
  const gestiona = permisos.cambiarResponsable || permisos.gestionarAsignados;
  const opciones = gestiona ? await casos.obtenerOpcionesDeProcesos(sesion) : null;
  const miembros = opciones?.ok ? opciones.value.miembros : [];
  const mensaje = typeof aviso === 'string' ? (AVISOS[aviso] ?? null) : null;
  // Qué se puede consultar según los números del proceso: las plataformas automáticas con
  // «Consultar ahora» y las asistidas (SPOA) en su propia página.
  const { automaticas, asistidas } = casos.catalogoDePlataformas;
  const tiene = (identificador: 'RADICADO' | 'NUNC') =>
    identificador === 'RADICADO' ? proceso.radicado !== null : proceso.nunc !== null;
  const consultable = automaticas.some((p) => tiene(p.identificador));
  const asistidasDelProceso = asistidas.filter((p) => tiene(p.identificador));
  const sinConsultar = asistidasDelProceso.filter(
    (a) => !proceso.plataformas.some((p) => p.plataforma === a.codigo),
  );
  const conDatos = proceso.plataformas.filter((p) => p.expedientes.length > 0);

  return (
    <>
      <AvisoDeLlegada mensaje={mensaje} />

      <div className="flex flex-col gap-4">
        <EnlaceDeRegreso href="/procesos" texto="Procesos" />
        <Encabezado
          titulo={nombreDeProceso(proceso)}
          descripcion={proceso.cliente ?? undefined}
          acciones={
            permisos.editar ? (
              <Button variant="outline" size="lg" asChild>
                <Link href={`/procesos/${proceso.id}/editar`}>
                  <Pencil aria-hidden />
                  Editar
                </Link>
              </Button>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <Identificadores radicado={proceso.radicado} nunc={proceso.nunc} />
          {proceso.activo ? null : <MarcaDeArchivado />}
          <ListaDeEtiquetas etiquetas={proceso.etiquetas.map((e) => e.nombre)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          {conDatos.map((p) => (
            <section
              key={p.plataforma}
              aria-labelledby={`titulo-datos-${p.plataforma}`}
              className="flex flex-col gap-3"
            >
              <TituloDeSeccion id={`titulo-datos-${p.plataforma}`}>
                Según {NOMBRE_EN_FRASE[p.plataforma]}
              </TituloDeSeccion>
              <DatosDeLaPlataforma plataforma={p.plataforma} expedientes={p.expedientes} />
            </section>
          ))}

          <section aria-labelledby="titulo-actuaciones" className="flex flex-col gap-3">
            <TituloDeSeccion
              id="titulo-actuaciones"
              detalle={
                proceso.totalActuaciones > 0
                  ? `${proceso.totalActuaciones} ${proceso.totalActuaciones === 1 ? 'actuación' : 'actuaciones'}`
                  : undefined
              }
            >
              Actuaciones
            </TituloDeSeccion>
            {proceso.actuaciones.length > 0 ? (
              <LineaDeTiempo
                procesoId={proceso.id}
                actuaciones={proceso.actuaciones}
                total={proceso.totalActuaciones}
                puedeAgregarDocumentos={permisos.editar}
              />
            ) : (
              <EstadoVacio
                icono={CalendarClock}
                titulo="Aún no hay actuaciones"
                descripcion={
                  consultable
                    ? 'Cuando LURIS consulte este proceso en la Rama Judicial, aquí verás cada actuación con la fecha en que la plataforma la registró. Puedes pedirlo ya con «Consultar ahora».'
                    : 'Cuando LURIS consulte este proceso en las plataformas oficiales, aquí verás cada actuación con la fecha en que la plataforma la registró.'
                }
              />
            )}
          </section>
        </div>

        <aside aria-label="Datos del proceso" className="flex flex-col gap-4">
          <section
            aria-labelledby="titulo-asignaciones"
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
          >
            <h2 id="titulo-asignaciones" className="text-base font-semibold tracking-[-0.005em]">
              Quién lo sigue
            </h2>
            <PanelDeAsignaciones
              procesoId={proceso.id}
              asignaciones={proceso.asignaciones}
              miembros={miembros}
              puedeCambiarResponsable={permisos.cambiarResponsable}
              puedeGestionarAsignados={permisos.gestionarAsignados}
              acciones={{
                asignarResponsable: asignarResponsableAccion,
                agregarAsignado: agregarAsignadoAccion,
                quitarAsignado: quitarAsignadoAccion,
              }}
            />
          </section>

          <section
            aria-labelledby="titulo-plataformas"
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
          >
            <h2 id="titulo-plataformas" className="text-base font-semibold tracking-[-0.005em]">
              Plataformas
            </h2>
            {proceso.plataformas.length + sinConsultar.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {proceso.plataformas.map((p) => (
                  <li key={p.plataforma} className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium">{NOMBRES_DE_PLATAFORMA[p.plataforma]}</span>
                    <span className="text-muted-foreground">
                      {p.estadoUltimaConsulta
                        ? DESCRIPCION_DE_ESTADO[p.estadoUltimaConsulta]
                        : 'Aún sin consultar'}
                    </span>
                    {p.ultimaConsultaEn ? (
                      <span className="text-muted-foreground">
                        Consultado el{' '}
                        <span className="cifras">{formatearDiaYHora(p.ultimaConsultaEn)}</span>
                      </span>
                    ) : null}
                    {p.ultimaSincronizacionEn &&
                    p.ultimaConsultaEn &&
                    p.ultimaSincronizacionEn < p.ultimaConsultaEn ? (
                      <span className="text-muted-foreground">
                        Última consulta exitosa el{' '}
                        <span className="cifras">
                          {formatearDiaYHora(p.ultimaSincronizacionEn)}
                        </span>
                      </span>
                    ) : null}
                  </li>
                ))}
                {sinConsultar.map((p) => (
                  <li key={p.codigo} className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium">{NOMBRES_DE_PLATAFORMA[p.codigo]}</span>
                    <span className="text-muted-foreground">
                      Aún sin consultar. Pide resolver un reto: la consulta la confirmas tú.
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {consultable
                  ? 'LURIS consulta este proceso en la Rama Judicial varias veces al día. Aún no se ha consultado.'
                  : 'Este proceso aún no tiene en qué plataforma consultarse.'}
              </p>
            )}
            {consultable || asistidasDelProceso.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {consultable ? (
                  <ConsultarAhora
                    procesoId={proceso.id}
                    acciones={{
                      consultarAhora: consultarAhoraAccion,
                      avance: avanceDeConsultaAccion,
                    }}
                  />
                ) : null}
                {asistidasDelProceso.some((p) => p.codigo === 'SPOA') ? (
                  <Button variant="outline" asChild className="self-start">
                    <Link href={`/procesos/${proceso.id}/spoa`}>
                      <ScanText aria-hidden />
                      Consultar en el SPOA
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="titulo-registro"
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
          >
            <h2 id="titulo-registro" className="text-base font-semibold tracking-[-0.005em]">
              En LURIS
            </h2>
            <p className="text-sm text-muted-foreground">
              Registrado el{' '}
              <span className="cifras text-foreground">{formatearDia(proceso.creadoEn)}</span>
            </p>
            {permisos.editar ? (
              <div className="border-t border-border pt-4">
                <ControlDeArchivo
                  procesoId={proceso.id}
                  activo={proceso.activo}
                  accion={cambiarEstadoDeProcesoAccion}
                />
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
