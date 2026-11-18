'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo } from '@/shared/ui/components/campo';
import {
  ESTADO_INICIAL,
  erroresDe,
  valorDe,
  type EstadoDeFormulario,
} from '@/shared/ui/estado-de-formulario';
import {
  FRECUENCIAS,
  NOMBRE_DE_FRECUENCIA,
  TEXTO_DE_CONSENTIMIENTO_WHATSAPP,
  type Frecuencia,
} from '../domain/frecuencias';
import { ADVERTENCIAS_DE_WHATSAPP } from '../domain/whatsapp';

type Accion = (anterior: EstadoDeFormulario, formulario: FormData) => Promise<EstadoDeFormulario>;

export interface ValoresDePreferencias {
  readonly correoActivo: boolean;
  readonly whatsappActivo: boolean;
  /** Como se muestra: «+57 300 123 4567». */
  readonly numeroWhatsapp: string;
  readonly frecuencia: Frecuencia;
}

const CLASE_DE_CASILLA =
  'mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Preferencias de notificación (§9): por qué canales y cuándo recibir los avisos de actuaciones
 * nuevas. WhatsApp exige número y consentimiento expreso, y muestra siempre sus advertencias.
 */
export function FormularioDePreferencias({
  accion,
  inicial,
  email,
}: {
  readonly accion: Accion;
  readonly inicial: ValoresDePreferencias;
  readonly email: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const conservado = (campo: string, porDefecto: boolean) => {
    const valor = valorDe(estado, campo);
    return valor === undefined ? porDefecto : valor === 'si';
  };
  const [whatsapp, setWhatsapp] = useState(inicial.whatsappActivo);

  return (
    <form
      action={enviar}
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <AvisoDeFormulario estado={estado} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">¿Por dónde quieres recibir los avisos?</legend>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="correoActivo"
            value="si"
            defaultChecked={conservado('correoActivo', inicial.correoActivo)}
            className={CLASE_DE_CASILLA}
          />
          <span>
            <span className="block font-medium">Correo electrónico</span>
            <span className="block text-muted-foreground">Llegan a {email}.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="whatsappActivo"
            value="si"
            defaultChecked={conservado('whatsappActivo', inicial.whatsappActivo)}
            onChange={(evento) => setWhatsapp(evento.target.checked)}
            className={CLASE_DE_CASILLA}
          />
          <span>
            <span className="block font-medium">WhatsApp</span>
            <span className="block text-muted-foreground">
              Solo si el administrador del despacho vinculó el WhatsApp de LURIS.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4">
        <Campo
          etiqueta="Tu número de WhatsApp"
          name="numeroWhatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="300 123 4567"
          defaultValue={valorDe(estado, 'numeroWhatsapp') ?? inicial.numeroWhatsapp}
          errores={erroresDe(estado, 'numeroWhatsapp')}
          ayuda="Un celular colombiano se completa solo con el indicativo +57."
        />
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="consentimientoWhatsapp"
              value="si"
              defaultChecked={conservado('consentimientoWhatsapp', inicial.whatsappActivo)}
              aria-invalid={erroresDe(estado, 'consentimientoWhatsapp').length > 0 || undefined}
              className={CLASE_DE_CASILLA}
            />
            <span>{TEXTO_DE_CONSENTIMIENTO_WHATSAPP}</span>
          </label>
          {erroresDe(estado, 'consentimientoWhatsapp').map((mensaje) => (
            <p key={mensaje} className="text-sm text-destructive">
              {mensaje}
            </p>
          ))}
        </div>
        {whatsapp || inicial.whatsappActivo ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {ADVERTENCIAS_DE_WHATSAPP.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">¿Cada cuánto?</legend>
        {FRECUENCIAS.map((frecuencia) => (
          <label key={frecuencia} className="flex items-start gap-3 text-sm">
            <input
              type="radio"
              name="frecuencia"
              value={frecuencia}
              defaultChecked={(valorDe(estado, 'frecuencia') ?? inicial.frecuencia) === frecuencia}
              className={CLASE_DE_CASILLA}
            />
            <span>{NOMBRE_DE_FRECUENCIA[frecuencia]}</span>
          </label>
        ))}
        {erroresDe(estado, 'frecuencia').map((mensaje) => (
          <p key={mensaje} className="text-sm text-destructive">
            {mensaje}
          </p>
        ))}
        <p className="text-sm text-muted-foreground">
          Si varias actuaciones de un mismo proceso llegan juntas, van en un solo aviso. Las fechas
          son siempre las que registró la plataforma judicial.
        </p>
      </fieldset>

      <Button type="submit" size="lg" className="self-start" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar preferencias'}
      </Button>
    </form>
  );
}
