'use client';

import { Archive, ArchiveRestore, UserRoundPlus, X } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { ESTADO_INICIAL, type EstadoDeFormulario } from '@/shared/ui/estado-de-formulario';
import { useAvisoDeExito } from '@/shared/ui/usar-aviso-de-exito';
import type { AsignacionDetallada } from '../application/puertos';
import type { MiembroAsignable } from '../domain/reglas';

type Accion = (anterior: EstadoDeFormulario, formulario: FormData) => Promise<EstadoDeFormulario>;

const NOMBRE_DEL_ROL: Readonly<Record<MiembroAsignable['rol'], string>> = {
  administrador: 'Administración',
  abogado: 'Abogado',
  asistente: 'Asistente',
};

const CLASES_DE_SELECTOR =
  'h-9 w-0 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function Persona({ asignacion }: { readonly asignacion: AsignacionDetallada }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{asignacion.nombre}</span>
      <span className="text-xs text-muted-foreground">
        {NOMBRE_DEL_ROL[asignacion.rol]}
        {asignacion.activa ? '' : ' · cuenta desactivada'}
      </span>
    </span>
  );
}

/** Responsable y personas de apoyo, con los controles que la persona tenga permitidos. */
export function PanelDeAsignaciones({
  procesoId,
  asignaciones,
  miembros,
  puedeCambiarResponsable,
  puedeGestionarAsignados,
  acciones,
}: {
  readonly procesoId: string;
  readonly asignaciones: readonly AsignacionDetallada[];
  /** Personas activas del despacho (solo se usan si hay algún permiso de gestión). */
  readonly miembros: readonly MiembroAsignable[];
  readonly puedeCambiarResponsable: boolean;
  readonly puedeGestionarAsignados: boolean;
  readonly acciones: {
    readonly asignarResponsable: Accion;
    readonly agregarAsignado: Accion;
    readonly quitarAsignado: Accion;
  };
}) {
  const [estadoResponsable, cambiarResponsable, cambiandoResponsable] = useActionState(
    acciones.asignarResponsable,
    ESTADO_INICIAL,
  );
  const [estadoAgregar, agregar, agregando] = useActionState(
    acciones.agregarAsignado,
    ESTADO_INICIAL,
  );
  const [estadoQuitar, quitar, quitando] = useActionState(acciones.quitarAsignado, ESTADO_INICIAL);
  useAvisoDeExito(estadoResponsable);
  useAvisoDeExito(estadoAgregar);
  useAvisoDeExito(estadoQuitar);
  const error = [estadoResponsable, estadoAgregar, estadoQuitar].find((e) => e.tipo === 'error');

  const responsable = asignaciones.find((a) => a.tipo === 'RESPONSABLE');
  const apoyo = asignaciones.filter((a) => a.tipo === 'ASIGNADO');
  const candidatosResponsable = miembros.filter((m) => m.rol !== 'asistente');
  const sinAsignar = miembros.filter(
    (m) => !asignaciones.some((a) => a.membresiaId === m.membresiaId),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Abogado responsable</h3>
        {responsable ? (
          <Persona asignacion={responsable} />
        ) : (
          <p className="text-sm text-muted-foreground">Sin responsable</p>
        )}
        {puedeCambiarResponsable ? (
          <form action={cambiarResponsable} className="flex items-center gap-2">
            <input type="hidden" name="procesoId" value={procesoId} />
            <label htmlFor="nuevo-responsable" className="sr-only">
              Elegir abogado responsable
            </label>
            <select
              id="nuevo-responsable"
              name="membresiaId"
              defaultValue={responsable?.membresiaId ?? ''}
              key={responsable?.membresiaId ?? 'ninguno'}
              className={CLASES_DE_SELECTOR}
            >
              <option value="">Sin responsable</option>
              {candidatosResponsable.map((m) => (
                <option key={m.membresiaId} value={m.membresiaId}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={cambiandoResponsable}>
              {cambiandoResponsable ? 'Guardando…' : 'Cambiar'}
            </Button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Apoyo en el seguimiento</h3>
        {apoyo.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {apoyo.map((asignacion) => (
              <li key={asignacion.membresiaId} className="flex items-center justify-between gap-2">
                <Persona asignacion={asignacion} />
                {puedeGestionarAsignados ? (
                  <form action={quitar}>
                    <input type="hidden" name="procesoId" value={procesoId} />
                    <input type="hidden" name="membresiaId" value={asignacion.membresiaId} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      disabled={quitando}
                      aria-label={`Quitar a ${asignacion.nombre} del proceso`}
                      className="text-muted-foreground hover:bg-error-suave hover:text-destructive"
                    >
                      <X aria-hidden />
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nadie más sigue este proceso.</p>
        )}
        {puedeGestionarAsignados && sinAsignar.length > 0 ? (
          <form action={agregar} className="flex items-center gap-2">
            <input type="hidden" name="procesoId" value={procesoId} />
            <label htmlFor="nuevo-apoyo" className="sr-only">
              Elegir persona para asignar
            </label>
            <select
              id="nuevo-apoyo"
              name="membresiaId"
              defaultValue=""
              className={CLASES_DE_SELECTOR}
            >
              <option value="" disabled>
                Elegir persona…
              </option>
              {sinAsignar.map((m) => (
                <option key={m.membresiaId} value={m.membresiaId}>
                  {m.nombre} · {NOMBRE_DEL_ROL[m.rol]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={agregando}>
              <UserRoundPlus aria-hidden />
              Asignar
            </Button>
          </form>
        ) : null}
      </div>

      {error ? <AvisoDeFormulario estado={error} /> : null}
    </div>
  );
}

/** Archivar (acción destructiva, aislada y discreta) o restaurar un proceso. */
export function ControlDeArchivo({
  procesoId,
  activo,
  accion,
}: {
  readonly procesoId: string;
  readonly activo: boolean;
  readonly accion: Accion;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="procesoId" value={procesoId} />
      <input type="hidden" name="activo" value={activo ? 'no' : 'si'} />
      <p className="text-sm text-muted-foreground">
        {activo
          ? 'Archivar lo saca de la lista de activos y LURIS deja de consultarlo. No se borra nada.'
          : 'Este proceso está archivado: no se consulta. Puedes restaurarlo cuando quieras.'}
      </p>
      <Button
        type="submit"
        variant={activo ? 'ghost' : 'outline'}
        disabled={enviando}
        className={
          activo
            ? '-ml-2.5 self-start text-destructive hover:bg-error-suave hover:text-destructive'
            : 'self-start'
        }
      >
        {activo ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
        {enviando ? 'Guardando…' : activo ? 'Archivar proceso' : 'Restaurar proceso'}
      </Button>
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
    </form>
  );
}
