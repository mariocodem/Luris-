/** Mientras carga la lista: silueta del encabezado, los filtros y las filas, sin saltos. */
export default function CargandoProcesos() {
  return (
    <div aria-busy="true" aria-label="Cargando procesos" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-36 animate-pulse rounded-xl bg-muted lg:h-32" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 px-5 py-4">
              <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
