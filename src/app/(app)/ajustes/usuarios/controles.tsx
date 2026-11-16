'use client';

import { Send, UserRoundCheck, UserRoundX, X } from 'lucide-react';
import { useActionState } from 'react';
import { ROLES_DE_DESPACHO, type RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo, Selector } from '@/shared/ui/components/campo';
import { ESTADO_INICIAL, erroresDe, valorDe } from '@/shared/ui/estado-de-formulario';
import { useAvisoDeExito } from '@/shared/ui/usar-aviso-de-exito';
import {
  cambiarEstadoDeCuentaAccion,
  cambiarRolAccion,
  cancelarInvitacionAccion,
  invitarAccion,
} from './acciones';

const NOMBRES: Readonly<Record<RolDeDespacho, string>> = {
  administrador: 'Administrador',
  abogado: 'Abogado',
  asistente: 'Asistente',
};

export function FormularioDeInvitacion() {
  const [estado, accion, enviando] = useActionState(invitarAccion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  return (
    <form
      action={accion}
      // Tras un envío exitoso se limpia el formulario (cambia la clave del estado).
      key={estado.tipo === 'exito' ? estado.mensaje : 'formulario'}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
      noValidate
    >
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
      <div className="grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-start">
        <Campo
          etiqueta="Correo electrónico"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="nombre@despacho.com"
          required
          defaultValue={valorDe(estado, 'email')}
          errores={erroresDe(estado, 'email')}
        />
        <Selector
          etiqueta="Rol"
          name="rol"
          defaultValue={valorDe(estado, 'rol') ?? 'abogado'}
          errores={erroresDe(estado, 'rol')}
        >
          {ROLES_DE_DESPACHO.map((rol) => (
            <option key={rol} value={rol}>
              {NOMBRES[rol]}
            </option>
          ))}
        </Selector>
        <Button type="submit" size="lg" className="md:mt-[1.625rem]" disabled={enviando}>
          <Send aria-hidden />
          {enviando ? 'Enviando…' : 'Enviar invitación'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        La persona recibe un enlace de un solo uso para crear su contraseña. Vence en 72 horas.
      </p>
    </form>
  );
}

export function ControlesDeMiembro({
  membresiaId,
  nombre,
  rol,
  activa,
  esPropia,
}: {
  readonly membresiaId: string;
  readonly nombre: string;
  readonly rol: RolDeDespacho;
  readonly activa: boolean;
  readonly esPropia: boolean;
}) {
  const [estadoRol, accionRol, cambiandoRol] = useActionState(cambiarRolAccion, ESTADO_INICIAL);
  const [estadoCuenta, accionCuenta, cambiandoCuenta] = useActionState(
    cambiarEstadoDeCuentaAccion,
    ESTADO_INICIAL,
  );
  useAvisoDeExito(estadoRol);
  useAvisoDeExito(estadoCuenta);
  const error = [estadoRol, estadoCuenta].find((e) => e.tipo === 'error');

  // La propia cuenta no se edita aquí; su fila ya lleva la etiqueta «Tu cuenta».
  if (esPropia) return null;

  return (
    <div className="flex flex-col gap-2 pl-[3.125rem] md:items-end md:pl-0">
      <div className="flex flex-wrap items-center gap-2">
        {activa ? (
          <form action={accionRol} className="flex items-center gap-2">
            <input type="hidden" name="membresiaId" value={membresiaId} />
            <label className="sr-only" htmlFor={`rol-${membresiaId}`}>
              Rol de {nombre}
            </label>
            <select
              id={`rol-${membresiaId}`}
              name="rol"
              defaultValue={rol}
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {ROLES_DE_DESPACHO.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {NOMBRES[opcion]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={cambiandoRol}>
              {cambiandoRol ? 'Guardando…' : 'Cambiar rol'}
            </Button>
          </form>
        ) : null}
        {/* La acción destructiva queda separada de las frecuentes por espacio deliberado. */}
        <form
          action={accionCuenta}
          className={activa ? 'md:ml-4 md:border-l md:border-border md:pl-4' : ''}
        >
          <input type="hidden" name="membresiaId" value={membresiaId} />
          <input type="hidden" name="activa" value={activa ? 'no' : 'si'} />
          <Button
            type="submit"
            variant={activa ? 'ghost' : 'outline'}
            disabled={cambiandoCuenta}
            aria-label={`${activa ? 'Desactivar' : 'Reactivar'} la cuenta de ${nombre}`}
            className={activa ? 'text-destructive hover:bg-error-suave hover:text-destructive' : ''}
          >
            {activa ? <UserRoundX aria-hidden /> : <UserRoundCheck aria-hidden />}
            {activa ? 'Desactivar' : 'Reactivar'}
          </Button>
        </form>
      </div>
      {error ? <AvisoDeFormulario estado={error} /> : null}
    </div>
  );
}

export function BotonCancelarInvitacion({
  invitacionId,
  email,
}: {
  readonly invitacionId: string;
  readonly email: string;
}) {
  const [estado, accion, enviando] = useActionState(cancelarInvitacionAccion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  return (
    <form action={accion} className="flex flex-col items-start gap-2 md:items-end">
      <input type="hidden" name="invitacionId" value={invitacionId} />
      <Button
        type="submit"
        variant="ghost"
        disabled={enviando}
        aria-label={`Cancelar la invitación de ${email}`}
        className="text-muted-foreground"
      >
        <X aria-hidden />
        Cancelar
      </Button>
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
    </form>
  );
}
