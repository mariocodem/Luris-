'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo, Selector } from '@/shared/ui/components/campo';
import {
  ESTADO_INICIAL,
  erroresDe,
  valorDe,
  type EstadoDeFormulario,
} from '@/shared/ui/estado-de-formulario';
import type { MiembroAsignable } from '../domain/reglas';
import { CampoDeIdentificador } from './campo-de-identificador';
import { OpcionesMarcables } from './opciones-marcables';

type Accion = (anterior: EstadoDeFormulario, formulario: FormData) => Promise<EstadoDeFormulario>;

const NOMBRE_DEL_ROL: Readonly<Record<MiembroAsignable['rol'], string>> = {
  administrador: 'Administración',
  abogado: 'Abogado',
  asistente: 'Asistente',
};

/** Separador de listas en los valores que se conservan tras un error (ver acciones.ts). */
function lista(valor: string | undefined): string[] | undefined {
  return valor === undefined ? undefined : valor.split('\u001f').filter(Boolean);
}

export interface ValoresDeProceso {
  readonly procesoId?: string;
  readonly radicado: string;
  readonly nunc: string;
  readonly alias: string;
  readonly cliente: string;
  readonly etiquetas: readonly string[];
}

/**
 * Formulario de registro y edición de un proceso. Las asignaciones solo aparecen al registrar y
 * solo para el administrador (el servidor lo vuelve a verificar).
 */
export function FormularioDeProceso({
  accion,
  modo,
  iniciales,
  etiquetasDisponibles,
  miembrosAsignables,
  identificadoresBloqueados,
  urlCancelar,
}: {
  readonly accion: Accion;
  readonly modo: 'registrar' | 'editar';
  readonly iniciales: ValoresDeProceso;
  readonly etiquetasDisponibles: readonly string[];
  /** Personas activas, si quien registra puede elegir responsable y apoyo. */
  readonly miembrosAsignables?: readonly MiembroAsignable[];
  readonly identificadoresBloqueados?: boolean;
  readonly urlCancelar: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, ESTADO_INICIAL);
  const valor = (campo: keyof Omit<ValoresDeProceso, 'etiquetas' | 'procesoId'>) =>
    valorDe(estado, campo) ?? iniciales[campo];
  const etiquetasMarcadas = new Set(lista(valorDe(estado, 'etiquetas')) ?? iniciales.etiquetas);
  // Las etiquetas del proceso siempre aparecen, aunque nadie más las use.
  const etiquetas = [...new Set([...etiquetasDisponibles, ...iniciales.etiquetas])].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
  const responsables = miembrosAsignables?.filter((m) => m.rol !== 'asistente') ?? [];
  const bloqueo = identificadoresBloqueados
    ? 'No se puede cambiar: el proceso ya tiene actuaciones.'
    : undefined;
  // Al reintentar tras un error, la clave nueva vuelve a montar los campos con lo conservado.
  const clave = estado.tipo === 'error' ? JSON.stringify(estado.valores ?? {}) : 'inicial';

  return (
    <form
      action={enviar}
      key={clave}
      noValidate
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      {iniciales.procesoId ? (
        <input type="hidden" name="procesoId" value={iniciales.procesoId} />
      ) : null}
      {estado.tipo === 'error' ? <AvisoDeFormulario estado={estado} /> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1.5 text-base font-semibold tracking-[-0.005em]">
          Identificación
        </legend>
        <p className="text-sm text-muted-foreground">
          Escribe el radicado de la Rama Judicial, el NUNC de la Fiscalía o ambos. LURIS los guarda
          solo con números.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <CampoDeIdentificador
            tipo="radicado"
            defaultValue={valor('radicado')}
            errores={erroresDe(estado, 'radicado')}
            bloqueado={bloqueo}
          />
          <CampoDeIdentificador
            tipo="nunc"
            defaultValue={valor('nunc')}
            errores={erroresDe(estado, 'nunc')}
            bloqueado={bloqueo}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-6">
        <legend className="sr-only">Datos del proceso</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo
            etiqueta="Alias"
            name="alias"
            defaultValue={valor('alias')}
            placeholder="Ej.: Restitución de inmueble"
            maxLength={200}
            autoComplete="off"
            ayuda="Un nombre corto para reconocerlo en la lista."
            errores={erroresDe(estado, 'alias')}
          />
          <Campo
            etiqueta="Cliente o parte"
            name="cliente"
            defaultValue={valor('cliente')}
            placeholder="Ej.: Inversiones El Prado S.A.S."
            maxLength={300}
            autoComplete="off"
            errores={erroresDe(estado, 'cliente')}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <OpcionesMarcables
          leyenda="Etiquetas"
          name="etiquetas"
          opciones={etiquetas.map((nombre) => ({ valor: nombre, texto: nombre }))}
          marcadas={etiquetasMarcadas}
        />
        <Campo
          etiqueta={etiquetas.length > 0 ? 'Agregar otras etiquetas' : 'Etiquetas'}
          name="etiquetasNuevas"
          defaultValue={valorDe(estado, 'etiquetasNuevas') ?? ''}
          placeholder="Ej.: Tutela, Bogotá"
          autoComplete="off"
          ayuda="Sepáralas con comas. Un proceso puede tener hasta 10."
          errores={erroresDe(estado, 'etiquetas')}
        />
      </div>

      {miembrosAsignables && modo === 'registrar' ? (
        // El filete va en un contenedor: sobre un <fieldset>, la leyenda lo interrumpiría.
        <div className="border-t border-border pt-6">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1.5 text-base font-semibold tracking-[-0.005em]">
              Asignación
            </legend>
            <Selector
              etiqueta="Abogado responsable"
              name="responsableId"
              defaultValue={valorDe(estado, 'responsableId') ?? ''}
              errores={erroresDe(estado, 'responsableId')}
              className="md:max-w-sm"
            >
              <option value="">Sin responsable por ahora</option>
              {responsables.map((m) => (
                <option key={m.membresiaId} value={m.membresiaId}>
                  {m.nombre} · {NOMBRE_DEL_ROL[m.rol]}
                </option>
              ))}
            </Selector>
            <OpcionesMarcables
              leyenda="Apoyo en el seguimiento"
              name="asignados"
              opciones={miembrosAsignables.map((m) => ({ valor: m.membresiaId, texto: m.nombre }))}
              marcadas={new Set(lista(valorDe(estado, 'asignados')) ?? [])}
              ayuda="Quienes no son administradores solo ven los procesos en los que participan."
            />
          </fieldset>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" asChild>
          <Link href={urlCancelar}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? 'Guardando…' : modo === 'registrar' ? 'Registrar proceso' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
