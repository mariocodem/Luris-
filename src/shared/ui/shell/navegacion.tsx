'use client';

import { ChevronsUpDown, LogOut, Menu, Settings } from 'lucide-react';
import Link from 'next/link';
import { cn } from 'cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/sheet';
import { ICONOS } from './iconos';
import { SelectorDeTema } from './selector-de-tema';
import type { EnlaceDeNavegacion, PersonaEnSesion } from './tipos';
import { useRutaActiva } from './usar-ruta-activa';

type AccionDeFormulario = (formulario: FormData) => void | Promise<void>;

interface PropsNavegacion {
  readonly enlaces: readonly EnlaceDeNavegacion[];
  readonly persona: PersonaEnSesion;
  readonly cerrarSesion: AccionDeFormulario;
  readonly rutaDeAjustes: string | null;
}

/** Barra lateral de escritorio (≥1024 px): estructura en azul marino. */
export function NavegacionLateral({
  enlaces,
  persona,
  cerrarSesion,
  rutaDeAjustes,
  contexto,
}: PropsNavegacion & { readonly contexto: string }) {
  const activa = useRutaActiva(enlaces);
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="px-6 pt-7 pb-6">
        <Link
          href={enlaces[0]?.href ?? '/'}
          className="rounded-sm font-serif text-2xl font-semibold tracking-[0.16em] focus-visible:outline-sidebar-ring"
        >
          LURIS
        </Link>
        <p className="mt-1 truncate text-sm text-sidebar-muted">{contexto}</p>
      </div>

      <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-0.5">
          {enlaces.map((enlace) => {
            const Icono = ICONOS[enlace.icono];
            const esActivo = enlace.href === activa;
            return (
              <li key={enlace.href}>
                <Link
                  href={enlace.href}
                  aria-current={esActivo ? 'page' : undefined}
                  className={cn(
                    'relative flex h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] transition-colors duration-150 focus-visible:outline-sidebar-ring',
                    esActivo
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  {esActivo ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary"
                    />
                  ) : null}
                  <Icono className="size-[1.125rem] shrink-0" aria-hidden />
                  {enlace.texto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
        <SelectorDeTema variante="barra-lateral" />
        <MenuDePersona
          persona={persona}
          cerrarSesion={cerrarSesion}
          rutaDeAjustes={rutaDeAjustes}
          enBarraLateral
        />
      </div>
    </aside>
  );
}

function MenuDePersona({
  persona,
  cerrarSesion,
  rutaDeAjustes,
  enBarraLateral = false,
}: Omit<PropsNavegacion, 'enlaces'> & { readonly enBarraLateral?: boolean }) {
  return (
    <DropdownMenu>
      {enBarraLateral ? (
        <DropdownMenuTrigger
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-sidebar-ring"
          aria-label={`Cuenta de ${persona.nombre}`}
        >
          <Iniciales nombre={persona.nombre} enBarraLateral />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{persona.nombre}</span>
            <span className="block truncate text-xs text-sidebar-muted">{persona.descripcion}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </DropdownMenuTrigger>
      ) : (
        // En la barra superior del móvil basta con las iniciales: deja espacio al despacho.
        <DropdownMenuTrigger
          className="flex size-11 items-center justify-center rounded-full transition-colors duration-150 hover:bg-accent"
          aria-label={`Cuenta de ${persona.nombre}`}
        >
          <Iniciales nombre={persona.nombre} enBarraLateral={false} />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" side={enBarraLateral ? 'top' : 'bottom'} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium text-foreground">{persona.nombre}</span>
          <span className="block text-xs text-muted-foreground">{persona.descripcion}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* En escritorio el tema vive en la barra lateral; en móvil, aquí. */}
        <div className="px-1 py-1 lg:hidden">
          <SelectorDeTema />
        </div>
        <DropdownMenuSeparator className="lg:hidden" />
        <DropdownMenuGroup>
          {rutaDeAjustes ? (
            <DropdownMenuItem asChild>
              <Link href={rutaDeAjustes}>
                <Settings aria-hidden />
                Ajustes
              </Link>
            </DropdownMenuItem>
          ) : null}
          <form action={cerrarSesion}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut aria-hidden />
                Cerrar sesión
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Iniciales({
  nombre,
  enBarraLateral,
}: {
  readonly nombre: string;
  readonly enBarraLateral: boolean;
}) {
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        enBarraLateral
          ? 'bg-white/[0.12] text-sidebar-accent-foreground'
          : 'bg-secondary text-secondary-foreground',
      )}
    >
      {iniciales}
    </span>
  );
}

/**
 * Barra superior del móvil y la tableta (<1024 px): marca, contexto y menú de la persona.
 * Material translúcido sobre el contenido, sólido si la persona reduce la transparencia.
 */
export function BarraSuperiorMovil({
  persona,
  cerrarSesion,
  rutaDeAjustes,
  contexto,
}: Omit<PropsNavegacion, 'enlaces'> & { readonly contexto: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-150 motion-safe:transition-colors contrast-more:bg-background lg:hidden [@media(prefers-reduced-transparency:reduce)]:bg-background">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-none font-semibold tracking-[0.14em]">LURIS</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{contexto}</p>
        </div>
        <MenuDePersona
          persona={persona}
          cerrarSesion={cerrarSesion}
          rutaDeAjustes={rutaDeAjustes}
        />
      </div>
    </header>
  );
}

/**
 * Barra inferior del móvil y la tableta: los destinos principales al alcance del pulgar y
 * «Más» abre una hoja con el resto, el tema y el cierre de sesión.
 */
export function NavegacionInferior({ enlaces, persona, cerrarSesion }: PropsNavegacion) {
  const activa = useRutaActiva(enlaces);
  const principales = enlaces.filter((e) => e.principalEnMovil).slice(0, 4);
  const secundarios = enlaces.filter((e) => !principales.includes(e));
  const masActivo = secundarios.some((e) => e.href === activa);
  // Con un solo destino una barra de pestañas no orienta: el título de la página basta.
  if (enlaces.length <= 1) return null;

  const clasesDeItem = (activo: boolean) =>
    cn(
      'flex h-full flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150 active:scale-[0.97]',
      activo ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 contrast-more:bg-background lg:hidden [@media(prefers-reduced-transparency:reduce)]:bg-background"
    >
      <ul className="mx-auto flex h-16 max-w-3xl items-stretch">
        {principales.map((enlace) => {
          const Icono = ICONOS[enlace.icono];
          const esActivo = enlace.href === activa;
          return (
            <li key={enlace.href} className="flex flex-1">
              <Link
                href={enlace.href}
                aria-current={esActivo ? 'page' : undefined}
                className={clasesDeItem(esActivo)}
              >
                <Icono className="size-5" aria-hidden strokeWidth={esActivo ? 2.25 : 1.75} />
                <span className="max-w-full truncate px-1">{enlace.texto}</span>
              </Link>
            </li>
          );
        })}
        {secundarios.length > 0 ? (
          <li className="flex flex-1">
            <Sheet>
              <SheetTrigger className={clasesDeItem(masActivo)}>
                <Menu className="size-5" aria-hidden />
                Más
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              >
                <SheetHeader className="text-left">
                  <SheetTitle>Más opciones</SheetTitle>
                  <SheetDescription>{persona.nombre}</SheetDescription>
                </SheetHeader>
                <ul className="flex flex-col gap-1 px-4">
                  {secundarios.map((enlace) => {
                    const Icono = ICONOS[enlace.icono];
                    const esActivo = enlace.href === activa;
                    return (
                      <li key={enlace.href}>
                        <Link
                          href={enlace.href}
                          aria-current={esActivo ? 'page' : undefined}
                          className={cn(
                            'flex h-12 items-center gap-3 rounded-lg px-3 text-base',
                            esActivo ? 'bg-accent font-semibold' : 'hover:bg-accent',
                          )}
                        >
                          <Icono className="size-5 text-muted-foreground" aria-hidden />
                          {enlace.texto}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-col gap-3 px-4">
                  <SelectorDeTema />
                  <form action={cerrarSesion}>
                    <button
                      type="submit"
                      className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-base text-destructive hover:bg-error-suave"
                    >
                      <LogOut className="size-5" aria-hidden />
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
