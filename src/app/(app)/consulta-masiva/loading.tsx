/** Mientras carga la consulta masiva: silueta del encabezado y del formulario, sin saltos. */
export default function CargandoConsultaMasiva() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando la consulta masiva"
      className="flex max-w-4xl flex-col gap-8"
    >
      <div className="flex flex-col gap-3">
        <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
