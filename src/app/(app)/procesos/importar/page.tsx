import type { Metadata } from 'next';
import { puede } from '@/modules/usuarios/domain/permisos';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { Importador } from '@/modules/procesos/ui/importador';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { importarProcesosAccion } from '../acciones';

export const metadata: Metadata = { title: 'Importar procesos' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaImportarProcesos() {
  const sesion = await sesionDeLaPeticion();
  const puedeImportar = puede(sesion.perfil, 'PROCESOS_REGISTRAR_EDITAR');

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <EnlaceDeRegreso href="/procesos" texto="Procesos" />
      <Encabezado
        titulo="Importar procesos"
        descripcion={
          puedeImportar
            ? 'Registra muchos procesos a la vez desde Excel o CSV. Antes de guardar verás cuáles están listos, cuáles ya existen y cuáles tienen errores.'
            : 'Tu rol no permite registrar procesos. Pide al administrador del despacho que los importe.'
        }
      />
      {puedeImportar ? <Importador accion={importarProcesosAccion} /> : null}
    </div>
  );
}
