/** Mientras se verifica la sesión: la silueta del shell, sin saltos al aparecer el contenido. */
export function EsqueletoDeShell() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex min-h-dvh flex-1">
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 border-b border-border lg:hidden" />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <div className="h-9 w-2/5 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-3/5 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-48 w-full animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

/** Silueta de una página dentro del shell (para `loading` y límites de <Suspense>). */
export function EsqueletoDePagina() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex flex-col gap-6">
      <div className="h-9 w-2/5 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-3/5 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-48 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
