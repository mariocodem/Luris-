'use client';

import { Ban, Plus, RotateCcw } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo } from '@/shared/ui/components/campo';
import { ESTADO_INICIAL, erroresDe, valorDe } from '@/shared/ui/estado-de-formulario';
import { useAvisoDeExito } from '@/shared/ui/usar-aviso-de-exito';
import { cambiarEstadoDeDespachoAccion, crearDespachoAccion } from './acciones';

export function FormularioDeNuevoDespacho() {
  const [estado, accion, enviando] = useActionState(crearDespachoAccion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  return (
    <form
      action={accion}
      key={estado.tipo === 'exito' ? estado.mensaje : 'formulario'}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
      noValidate
    >
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Campo
          etiqueta="Nombre del despacho"
          name="nombre"
          required
          autoComplete="organization"
          defaultValue={valorDe(estado, 'nombre')}
          errores={erroresDe(estado, 'nombre')}
        />
        <Campo
          etiqueta="NIT (opcional)"
          name="nit"
          inputMode="numeric"
          autoComplete="off"
          ayuda="Con o sin puntos y guion; se guarda solo con números."
          defaultValue={valorDe(estado, 'nit')}
          errores={erroresDe(estado, 'nit')}
        />
      </div>
      <Campo
        etiqueta="Correo del primer administrador"
        name="emailAdministrador"
        type="email"
        inputMode="email"
        autoComplete="off"
        required
        ayuda="Le enviaremos una invitación para crear su contraseña y administrar el despacho."
        defaultValue={valorDe(estado, 'emailAdministrador')}
        errores={erroresDe(estado, 'emailAdministrador')}
      />
      <Button type="submit" size="lg" className="self-start" disabled={enviando}>
        <Plus aria-hidden />
        {enviando ? 'Creando…' : 'Crear despacho'}
      </Button>
    </form>
  );
}

export function BotonDeEstadoDeDespacho({
  despachoId,
  nombre,
  suspendido,
}: {
  readonly despachoId: string;
  readonly nombre: string;
  readonly suspendido: boolean;
}) {
  const [estado, accion, enviando] = useActionState(cambiarEstadoDeDespachoAccion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  return (
    <form action={accion} className="flex flex-col items-start gap-2 md:items-end">
      <input type="hidden" name="despachoId" value={despachoId} />
      <input type="hidden" name="estado" value={suspendido ? 'ACTIVO' : 'SUSPENDIDO'} />
      <Button
        type="submit"
        variant={suspendido ? 'outline' : 'ghost'}
        disabled={enviando}
        aria-label={`${suspendido ? 'Reactivar' : 'Suspender'} ${nombre}`}
        className={suspendido ? '' : 'text-destructive hover:bg-error-suave hover:text-destructive'}
      >
        {suspendido ? <RotateCcw aria-hidden /> : <Ban aria-hidden />}
        {suspendido ? 'Reactivar' : 'Suspender'}
      </Button>
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
    </form>
  );
}
