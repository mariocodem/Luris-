import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { nombreDeProceso } from '@/modules/procesos/domain/proceso';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { FormularioDeProceso } from '@/modules/procesos/ui/formulario-de-proceso';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../../_servidor/sesion';
import { editarProcesoAccion } from '../../acciones';

export const metadata: Metadata = { title: 'Editar proceso' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaEditarProceso({ params }: PageProps<'/procesos/[id]/editar'>) {
  const sesion = await sesionDeLaPeticion();
  const { id } = await params;
  const casos = casosDeUso();
  const [ficha, opciones] = await Promise.all([
    casos.consultarProceso(sesion, id),
    casos.obtenerOpcionesDeProcesos(sesion),
  ]);
  if (!ficha.ok) {
    if (ficha.error.codigo === 'NO_ENCONTRADO') notFound();
    return <Encabezado titulo="Editar proceso" descripcion={ficha.error.mensajeUsuario} />;
  }
  const { proceso, permisos } = ficha.value;
  const volver = `/procesos/${proceso.id}`;

  if (!permisos.editar) {
    return (
      <div className="flex flex-col gap-4">
        <EnlaceDeRegreso href={volver} texto={nombreDeProceso(proceso)} />
        <Encabezado
          titulo="Editar proceso"
          descripcion="Puedes ver este proceso, pero no editarlo. Pide al administrador del despacho que te lo asigne."
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EnlaceDeRegreso href={volver} texto={nombreDeProceso(proceso)} />
      <Encabezado
        titulo="Editar proceso"
        descripcion="Para cambiar quién lo sigue o archivarlo, usa la ficha del proceso."
      />
      <FormularioDeProceso
        accion={editarProcesoAccion}
        modo="editar"
        iniciales={{
          procesoId: proceso.id,
          radicado: proceso.radicado ?? '',
          nunc: proceso.nunc ?? '',
          alias: proceso.alias ?? '',
          cliente: proceso.cliente ?? '',
          etiquetas: proceso.etiquetas.map((e) => e.nombre),
        }}
        etiquetasDisponibles={opciones.ok ? opciones.value.etiquetas.map((e) => e.nombre) : []}
        identificadoresBloqueados={proceso.totalActuaciones > 0}
        urlCancelar={volver}
      />
    </div>
  );
}
