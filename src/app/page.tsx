// Portada provisional. El shell de la aplicación se construye en la Fase 3.
export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-medium text-muted-foreground">LURIS</p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Tus procesos judiciales, en un solo lugar
      </h1>
      <p className="text-base text-pretty text-muted-foreground">
        Estamos preparando tu espacio de trabajo. Pronto podrás consultar y seguir tus procesos de
        la Rama Judicial, SPOA, SAMAI, SIUGJ y Tyba desde aquí.
      </p>
    </main>
  );
}
