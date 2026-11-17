import type { Metadata } from 'next';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { FormularioDeProceso } from '@/modules/procesos/ui/formulario-de-proceso';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { registrarProcesoAccion } from '../acciones';

export const metadata: Metadata = { title: 'Registrar proceso' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaRegistrarProceso() {
  const sesion = await sesionDeLaPeticion();
  const opciones = await casosDeUso().obtenerOpcionesDeProcesos(sesion);
  if (!opciones.ok) {
    return <Encabezado titulo="Registrar proceso" descripcion={opciones.error.mensajeUsuario} />;
  }
  const { etiquetas, miembros, puedeElegirResponsable } = opciones.value;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <EnlaceDeRegreso href="/procesos" texto="Procesos" />
      <Encabezado
        titulo="Registrar proceso"
        descripcion={
          puedeElegirResponsable
            ? 'Con el radicado o el NUNC basta. Puedes elegir quién lo sigue ahora o después, desde la ficha del proceso.'
            : 'Con el radicado o el NUNC basta. Quedarás asignado para seguirlo; el administrador puede sumar a más personas.'
        }
      />
      <FormularioDeProceso
        accion={registrarProcesoAccion}
        modo="registrar"
        iniciales={{ radicado: '', nunc: '', alias: '', cliente: '', etiquetas: [] }}
        etiquetasDisponibles={etiquetas.map((e) => e.nombre)}
        miembrosAsignables={puedeElegirResponsable ? miembros : undefined}
        urlCancelar="/procesos"
      />
    </div>
  );
}
