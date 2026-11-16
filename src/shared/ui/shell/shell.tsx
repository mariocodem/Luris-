import type { ReactNode } from 'react';
import { BarraSuperiorMovil, NavegacionInferior, NavegacionLateral } from './navegacion';
import type { EnlaceDeNavegacion, PersonaEnSesion } from './tipos';

interface PropsShell {
  /** Debajo de la marca: el despacho, o «Operación de la plataforma» para el superadmin. */
  readonly contexto: string;
  readonly enlaces: readonly EnlaceDeNavegacion[];
  readonly persona: PersonaEnSesion;
  readonly cerrarSesion: (formulario: FormData) => void | Promise<void>;
  readonly rutaDeAjustes: string | null;
  readonly children: ReactNode;
}

/**
 * Marco de la aplicación autenticada.
 * - ≥1024 px: barra lateral azul marino fija y contenido a la derecha.
 * - <1024 px: barra superior con la persona y barra inferior con los destinos principales.
 * La navegación recibe solo los enlaces que el rol permite; los permisos se vuelven a
 * verificar en el servidor en cada página y acción.
 */
export function Shell({
  contexto,
  enlaces,
  persona,
  cerrarSesion,
  rutaDeAjustes,
  children,
}: PropsShell) {
  const navegacion = { enlaces, persona, cerrarSesion, rutaDeAjustes };
  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#contenido"
        className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <NavegacionLateral {...navegacion} contexto={contexto} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperiorMovil
          persona={persona}
          cerrarSesion={cerrarSesion}
          rutaDeAjustes={rutaDeAjustes}
          contexto={contexto}
        />
        <main
          id="contenido"
          tabIndex={-1}
          className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-6 outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-12 ${enlaces.length > 1 ? 'pb-28' : 'pb-12'}`}
        >
          {children}
        </main>
      </div>
      <NavegacionInferior {...navegacion} />
    </div>
  );
}
