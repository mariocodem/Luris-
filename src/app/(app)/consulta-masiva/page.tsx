import type { Metadata } from 'next';
import { HistorialDeConsultasMasivas } from '@/modules/plataformas/ui/historial-de-consultas-masivas';
import { FormularioDeConsultaMasiva } from '@/modules/plataformas/ui/formulario-de-consulta-masiva';
import { puede } from '@/modules/usuarios/domain/permisos';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../_servidor/sesion';
import { consultaMasivaAccion } from './acciones';

export const metadata: Metadata = { title: 'Consulta masiva' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaDeConsultaMasiva() {
  const sesion = await sesionDeLaPeticion();
  const permitida = puede(sesion.perfil, 'CONSULTA_MASIVA');
  const historial = permitida ? await casosDeUso().listarConsultasMasivas(sesion) : null;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <Encabezado
        titulo="Consulta masiva"
        descripcion={
          permitida
            ? 'Consulta hasta 400 procesos en una sola operación. Antes de empezar verás cuáles están listos y cuáles tienen errores; después puedes cerrar la página y volver cuando quieras.'
            : 'Tu rol no permite hacer consultas masivas. Pide al administrador del despacho que lo haga.'
        }
      />
      {permitida ? <FormularioDeConsultaMasiva accion={consultaMasivaAccion} /> : null}
      {historial?.ok ? <HistorialDeConsultasMasivas lista={historial.value} /> : null}
    </div>
  );
}
