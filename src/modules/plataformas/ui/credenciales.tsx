'use client';

import { KeyRound, Trash2 } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo } from '@/shared/ui/components/campo';
import {
  ESTADO_INICIAL,
  erroresDe,
  type EstadoDeFormulario,
} from '@/shared/ui/estado-de-formulario';
import { useAvisoDeExito } from '@/shared/ui/usar-aviso-de-exito';
import { type PlataformaConCredenciales, TEXTO_DE_CONSENTIMIENTO } from '../domain/credenciales';

type Accion = (anterior: EstadoDeFormulario, formulario: FormData) => Promise<EstadoDeFormulario>;

/**
 * Formulario para guardar (o reemplazar) una credencial de plataforma. El consentimiento es
 * explícito y obligatorio (§6); la contraseña nunca vuelve del servidor.
 */
export function FormularioDeCredencial({
  plataforma,
  puedeDelDespacho,
  reemplaza,
  accion,
}: {
  readonly plataforma: PlataformaConCredenciales;
  /** El administrador puede guardarla para todo el despacho. */
  readonly puedeDelDespacho: boolean;
  /** Ya hay una: el botón dice «Reemplazar». */
  readonly reemplaza: boolean;
  readonly accion: Accion;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  useAvisoDeExito(estado);
  // Tras guardar, el formulario queda vacío (la contraseña no se conserva en la página).
  useEffect(() => {
    if (estado.tipo === 'exito') formulario.current?.reset();
  }, [estado]);
  const valor = (campo: string) => (estado.tipo === 'error' ? (estado.valores?.[campo] ?? '') : '');
  const alcance = valor('alcance') || 'PERSONAL';
  const errorDeConsentimiento = erroresDe(estado, 'consiente');

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="plataforma" value={plataforma} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Usuario"
          name="usuario"
          autoComplete="off"
          defaultValue={valor('usuario')}
          errores={erroresDe(estado, 'usuario')}
          required
        />
        <Campo
          etiqueta="Contraseña"
          name="secreto"
          type="password"
          autoComplete="new-password"
          errores={erroresDe(estado, 'secreto')}
          required
        />
      </div>

      {puedeDelDespacho ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">¿De quién es la cuenta?</legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="alcance"
              value="PERSONAL"
              defaultChecked={alcance === 'PERSONAL'}
              className="mt-1 size-4 accent-primary"
            />
            <span>Mía (la usa LURIS para los procesos que sigo)</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="alcance"
              value="DESPACHO"
              defaultChecked={alcance === 'DESPACHO'}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              Del despacho (la usa LURIS cuando el abogado responsable no tiene una propia)
            </span>
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="alcance" value="PERSONAL" />
      )}

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 text-sm text-pretty">
          <input
            type="checkbox"
            name="consiente"
            value="si"
            className="mt-1 size-4 shrink-0 accent-primary"
            aria-invalid={errorDeConsentimiento.length > 0 || undefined}
            aria-describedby={
              errorDeConsentimiento.length > 0 ? `${plataforma}-consentimiento-error` : undefined
            }
          />
          <span>{TEXTO_DE_CONSENTIMIENTO}</span>
        </label>
        {errorDeConsentimiento.length > 0 ? (
          <p id={`${plataforma}-consentimiento-error`} className="text-sm text-destructive">
            {errorDeConsentimiento[0]}
          </p>
        ) : null}
      </div>

      <AvisoDeFormulario estado={estado} />
      <Button type="submit" size="lg" disabled={enviando} className="self-start">
        <KeyRound aria-hidden />
        {enviando ? 'Guardando…' : reemplaza ? 'Reemplazar credencial' : 'Guardar credencial'}
      </Button>
    </form>
  );
}

/** Eliminar con un paso de confirmación: después, LURIS ya no la usa. */
export function EliminarCredencial({
  id,
  descripcion,
  accion,
}: {
  readonly id: string;
  /** p. ej. «tu credencial de SAMAI». */
  readonly descripcion: string;
  readonly accion: Accion;
}) {
  // Al borrarla, la lista se actualiza y este control desaparece: el aviso se lanza desde la
  // acción misma, no desde un efecto del componente (que ya no estaría montado).
  const [estado, enviar, enviando] = useActionState(
    async (anterior: EstadoDeFormulario, formulario: FormData) => {
      const resultado = await accion(anterior, formulario);
      if (resultado.tipo === 'exito') toast.success(resultado.mensaje);
      return resultado;
    },
    ESTADO_INICIAL,
  );
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirmando(true)}
        className="-ml-2.5 text-destructive hover:text-destructive"
      >
        <Trash2 aria-hidden />
        Eliminar
      </Button>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">¿Eliminar {descripcion}? LURIS dejará de usarla.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={enviando}>
          {enviando ? 'Eliminando…' : 'Sí, eliminar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
      <AvisoDeFormulario estado={estado} />
    </form>
  );
}

/**
 * La plataforma (SIUGJ) pidió un código de acceso: la persona escribe el que le llegó. LURIS lo
 * entrega una sola vez a la plataforma; nunca lo lee del correo ni lo guarda.
 */
export function FormularioDeCodigoDeAcceso({
  credencialId,
  plataforma,
  venceA,
  accion,
}: {
  readonly credencialId: string;
  readonly plataforma: string;
  /** Hora (texto para mostrar) hasta la que la plataforma espera el código. */
  readonly venceA: string;
  readonly accion: Accion;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  useAvisoDeExito(estado);
  if (estado.tipo === 'exito') return null;
  return (
    <form
      action={enviar}
      className="flex flex-col gap-3 rounded-lg border border-nuevo/50 bg-nuevo-suave px-4 py-3"
    >
      <input type="hidden" name="credencialId" value={credencialId} />
      <p className="text-sm text-pretty">
        <span className="font-semibold text-nuevo-texto">
          {plataforma} pidió un código de acceso.
        </span>{' '}
        Escribe el que te llegó (por correo o mensaje) antes de las{' '}
        <span className="cifras">{venceA}</span>. Después LURIS consultará tus procesos sola.
      </p>
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Campo
          etiqueta="Código de acceso"
          name="codigo"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={20}
          required
          className="w-44"
          errores={erroresDe(estado, 'codigo')}
        />
        <Button type="submit" disabled={enviando}>
          <KeyRound aria-hidden />
          {enviando ? 'Enviando…' : 'Enviar código'}
        </Button>
      </div>
    </form>
  );
}
