'use client';

import { Search } from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import type { ChangeEvent } from 'react';
import { Button } from '@/shared/ui/components/button';
import { Selector } from '@/shared/ui/components/campo';

export interface ValoresDeFiltro {
  readonly q: string;
  readonly estado: string;
  readonly etiqueta: string;
  readonly responsable: string;
  readonly orden: string;
}

/**
 * Búsqueda y filtros de la lista de procesos. Es un formulario GET: los filtros viven en la URL
 * (se pueden compartir y funcionan sin JavaScript); con JavaScript, cambiar un selector filtra
 * de inmediato.
 */
export function BarraDeFiltros({
  valores,
  etiquetas,
  responsables,
  hayFiltros,
}: {
  readonly valores: ValoresDeFiltro;
  readonly etiquetas: readonly { readonly id: string; readonly nombre: string }[];
  readonly responsables: readonly { readonly membresiaId: string; readonly nombre: string }[];
  readonly hayFiltros: boolean;
}) {
  const filtrarAlCambiar = (evento: ChangeEvent<HTMLSelectElement>) => {
    evento.currentTarget.form?.requestSubmit();
  };

  return (
    <Form
      action="/procesos"
      role="search"
      aria-label="Buscar y filtrar procesos"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="busqueda-procesos" className="sr-only">
            Buscar por radicado, NUNC, alias o cliente
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="busqueda-procesos"
            type="search"
            name="q"
            defaultValue={valores.q}
            maxLength={100}
            placeholder="Buscar por radicado, NUNC, alias o cliente"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
        </div>
        <Button type="submit" size="lg" variant="secondary">
          Buscar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Selector
          etiqueta="Estado"
          name="estado"
          defaultValue={valores.estado}
          onChange={filtrarAlCambiar}
        >
          <option value="activos">Activos</option>
          <option value="archivados">Archivados</option>
          <option value="todos">Todos</option>
        </Selector>
        <Selector
          etiqueta="Etiqueta"
          name="etiqueta"
          defaultValue={valores.etiqueta}
          onChange={filtrarAlCambiar}
        >
          <option value="">Todas</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Responsable"
          name="responsable"
          defaultValue={valores.responsable}
          onChange={filtrarAlCambiar}
        >
          <option value="">Todos</option>
          <option value="ninguno">Sin responsable</option>
          {responsables.map((m) => (
            <option key={m.membresiaId} value={m.membresiaId}>
              {m.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Orden"
          name="orden"
          defaultValue={valores.orden}
          onChange={filtrarAlCambiar}
        >
          <option value="recientes">Recientes</option>
          <option value="alias">Alias A–Z</option>
        </Selector>
      </div>

      {hayFiltros ? (
        <Link
          href="/procesos"
          className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Quitar búsqueda y filtros
        </Link>
      ) : null}
    </Form>
  );
}
