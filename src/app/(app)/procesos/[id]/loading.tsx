/** Mientras carga la ficha: silueta del encabezado, la línea de tiempo y la columna lateral. */
export default function CargandoProceso() {
  return (
    <div aria-busy="true" aria-label="Cargando el proceso" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-9 w-3/5 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-6 px-5 py-4">
              <div className="h-11 w-24 shrink-0 animate-pulse rounded bg-muted" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
