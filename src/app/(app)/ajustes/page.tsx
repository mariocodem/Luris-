import { ChevronRight, KeyRound, MessageCircle, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { nombreDelRol } from '@/modules/usuarios/application/correos';
import { puede } from '@/modules/usuarios/domain/permisos';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { SelectorDeTema } from '@/shared/ui/shell/selector-de-tema';
import { sesionDeLaPeticion } from '../../_servidor/sesion';

export const metadata: Metadata = { title: 'Ajustes' };

// Depende de la sesión en cada petición.
export const instant = false;

export default async function PaginaDeAjustes() {
  const sesion = await sesionDeLaPeticion();
  const datos = [
    { termino: 'Nombre', valor: sesion.nombre },
    { termino: 'Correo', valor: sesion.email },
    {
      termino: 'Rol',
      valor: sesion.perfil === 'superadmin' ? 'Operador de LURIS' : nombreDelRol(sesion.perfil),
    },
    { termino: 'Despacho', valor: sesion.despacho?.nombre ?? '—' },
  ];

  return (
    <>
      <Encabezado
        titulo="Ajustes"
        descripcion="Tu cuenta y cómo se ve LURIS en este dispositivo."
      />

      <section aria-labelledby="titulo-apariencia" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-apariencia">Apariencia</TituloDeSeccion>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-sm text-muted-foreground">
            «Sistema» sigue la configuración de tu computador o celular. La elección se guarda en
            este dispositivo.
          </p>
          <div className="w-full sm:w-80">
            <SelectorDeTema />
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-cuenta" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-cuenta">Tu cuenta</TituloDeSeccion>
        <dl className="divide-y divide-border rounded-xl border border-border bg-card">
          {datos.map(({ termino, valor }) => (
            <div key={termino} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">{termino}</dt>
              <dd className="text-sm font-medium break-words">{valor}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Para cambiar tu contraseña, cierra sesión y usa «¿Olvidaste tu contraseña?».
        </p>
      </section>

      {puede(sesion.perfil, 'CREDENCIALES_GESTIONAR') ? (
        <section aria-labelledby="titulo-plataformas" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-plataformas">Plataformas</TituloDeSeccion>
          <Link
            href="/ajustes/plataformas"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors duration-150 hover:border-input hover:bg-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Cuentas en las plataformas</span>
              <span className="block text-sm text-muted-foreground">
                Tu usuario de SAMAI, para que LURIS vea lo que solo ve una cuenta registrada.
              </span>
            </span>
            <ChevronRight
              className="size-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </section>
      ) : null}

      {puede(sesion.perfil, 'CUENTAS_GESTIONAR') ? (
        <section aria-labelledby="titulo-despacho" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-despacho">Despacho</TituloDeSeccion>
          <Link
            href="/ajustes/whatsapp"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors duration-150 hover:border-input hover:bg-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">WhatsApp del despacho</span>
              <span className="block text-sm text-muted-foreground">
                Vincula un número dedicado para avisar de las actuaciones nuevas.
              </span>
            </span>
            <ChevronRight
              className="size-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
          <Link
            href="/ajustes/usuarios"
            className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors duration-150 hover:border-input hover:bg-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Users className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Usuarios del despacho</span>
              <span className="block text-sm text-muted-foreground">
                Invita personas, asigna roles y desactiva cuentas.
              </span>
            </span>
            <ChevronRight
              className="size-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </section>
      ) : null}
    </>
  );
}
