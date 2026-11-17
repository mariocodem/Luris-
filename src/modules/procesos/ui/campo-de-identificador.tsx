'use client';

import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from 'cn';
import { normalizarADigitos } from '@/shared/domain/identificador-judicial';
import { crearNunc } from '@/shared/domain/nunc';
import { crearRadicado } from '@/shared/domain/radicado';

const DEFINICION = {
  radicado: { etiqueta: 'Radicado', longitud: 23, validar: crearRadicado },
  nunc: { etiqueta: 'NUNC', longitud: 21, validar: crearNunc },
} as const;

/**
 * Campo de radicado o NUNC con validación en tiempo real (§10): cuenta las cifras mientras se
 * escribe, confirma cómo se guardará (solo dígitos) y, al salir del campo, explica el error con
 * el mismo mensaje del dominio que usa el servidor.
 */
export function CampoDeIdentificador({
  tipo,
  defaultValue = '',
  errores = [],
  bloqueado,
}: {
  readonly tipo: 'radicado' | 'nunc';
  readonly defaultValue?: string;
  /** Errores del servidor; se ocultan en cuanto la persona corrige el campo. */
  readonly errores?: readonly string[];
  /** Si no se puede cambiar, por qué (se muestra como ayuda y el campo queda de solo lectura). */
  readonly bloqueado?: string;
}) {
  const { etiqueta, longitud, validar } = DEFINICION[tipo];
  const id = useId();
  const [valor, setValor] = useState(defaultValue);
  const [tocado, setTocado] = useState(false);

  const digitos = normalizarADigitos(valor);
  const vacio = valor.trim() === '';
  const completo = digitos.length === longitud;
  const resultado = validar(valor);
  const errorLocal = tocado && !vacio && !resultado.ok ? resultado.error.mensajeUsuario : null;
  const visibles = errorLocal ? [errorLocal] : valor === defaultValue ? errores : [];

  const idEstado = `${id}-estado`;
  const idError = visibles.length > 0 ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta} <span className="font-normal text-muted-foreground">({longitud} números)</span>
      </label>
      <input
        id={id}
        name={tipo}
        value={valor}
        onChange={(evento) => setValor(evento.target.value)}
        onBlur={() => setTocado(true)}
        readOnly={bloqueado !== undefined}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={visibles.length > 0 || undefined}
        aria-describedby={[idEstado, idError].filter(Boolean).join(' ')}
        className={cn(
          'cifras h-10 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground read-only:cursor-not-allowed read-only:bg-muted read-only:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm',
        )}
      />
      <p id={idEstado} className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {bloqueado ? (
          bloqueado
        ) : vacio ? (
          'Puedes pegarlo con guiones o espacios.'
        ) : completo && resultado.ok ? (
          <>
            <Check className="size-4 shrink-0 text-exito" aria-hidden />
            <span>
              Se guardará como <span className="cifras text-foreground">{resultado.value}</span>
            </span>
          </>
        ) : (
          <span className="cifras">
            {digitos.length} de {longitud} números
          </span>
        )}
      </p>
      {idError ? (
        <ul id={idError} className="text-sm text-destructive">
          {visibles.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
