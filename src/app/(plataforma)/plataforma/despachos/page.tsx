import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { formatearDia } from '@/shared/domain/fechas';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { BotonDeEstadoDeDespacho, FormularioDeNuevoDespacho } from './controles';

export const metadata: Metadata = { title: 'Despachos' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaDeDespachos() {
  const sesion = await sesionDeLaPeticion();
  const resultado = await casosDeUso().listarDespachos(sesion);
  if (!resultado.ok) {
    return <Encabezado titulo="Despachos" descripcion={resultado.error.mensajeUsuario} />;
  }
  const despachos = resultado.value;

  return (
    <>
      <Encabezado
        titulo="Despachos"
        descripcion="Crea despachos y suspende o reactiva su acceso. Desde aquí no se ven los procesos de ningún despacho."
      />

      <section aria-labelledby="titulo-nuevo" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-nuevo">Nuevo despacho</TituloDeSeccion>
        <FormularioDeNuevoDespacho />
      </section>

      <section aria-labelledby="titulo-lista" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-lista" detalle={`${despachos.length}`}>
          Despachos registrados
        </TituloDeSeccion>
        {despachos.length === 0 ? (
          <EstadoVacio
            icono={Building2}
            titulo="Todavía no hay despachos"
            descripcion="Crea el primero con el formulario de arriba; su administrador recibirá una invitación por correo."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {despachos.map((despacho) => (
              <li
                key={despacho.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                    {despacho.nombre}
                    {despacho.estado === 'SUSPENDIDO' ? (
                      <span className="rounded-full bg-error-suave px-2 py-0.5 text-xs font-medium text-destructive">
                        Suspendido
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {despacho.nit ? (
                      <>
                        NIT <span className="cifras">{despacho.nit}</span> ·{' '}
                      </>
                    ) : null}
                    {despacho.miembrosActivos}{' '}
                    {despacho.miembrosActivos === 1 ? 'cuenta activa' : 'cuentas activas'} · desde
                    el <span className="cifras">{formatearDia(despacho.creadoEn)}</span>
                  </p>
                </div>
                <BotonDeEstadoDeDespacho
                  despachoId={despacho.id}
                  nombre={despacho.nombre}
                  suspendido={despacho.estado === 'SUSPENDIDO'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
