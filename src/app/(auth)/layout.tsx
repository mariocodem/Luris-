import Link from 'next/link';

const PLATAFORMAS = ['Rama Judicial', 'SPOA', 'SAMAI', 'SIUGJ', 'Tyba'];

/**
 * Pantallas de acceso. Escritorio: panel azul marino con la marca a la izquierda y el
 * formulario sobre papel blanco. Móvil: una sola columna con la marca arriba.
 */
export default function LayoutDeAcceso({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-1 bg-card">
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between bg-sidebar px-12 py-12 text-sidebar-foreground lg:flex xl:px-16">
        <Link
          href="/iniciar-sesion"
          className="self-start rounded-sm font-serif text-3xl font-semibold tracking-[0.18em] focus-visible:outline-sidebar-ring"
        >
          LURIS
        </Link>
        <div className="flex flex-col gap-6">
          <p className="max-w-md font-serif text-[2rem] leading-[1.2] font-medium tracking-[-0.01em] text-balance">
            Tus procesos judiciales, con la fecha que cada plataforma registró.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold tracking-[0.14em] text-sidebar-muted uppercase">
            {PLATAFORMAS.map((plataforma) => (
              <li key={plataforma}>{plataforma}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-sidebar-muted">
          Seguimiento judicial para despachos en Colombia
        </p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <Link
            href="/iniciar-sesion"
            className="self-start rounded-sm font-serif text-2xl font-semibold tracking-[0.16em] lg:hidden"
          >
            LURIS
          </Link>
          <main className="flex flex-col gap-6 [&_h1]:font-serif [&_h1]:text-[1.75rem] [&_h1]:leading-tight [&_h1]:font-semibold [&_h1]:tracking-[-0.01em]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
