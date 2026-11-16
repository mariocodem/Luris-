import type { Metadata } from 'next';
import { nombreDelRol } from '@/modules/usuarios/application/correos';
import { formatearDia } from '@/shared/domain/fechas';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { BotonCancelarInvitacion, ControlesDeMiembro, FormularioDeInvitacion } from './controles';

export const metadata: Metadata = { title: 'Usuarios del despacho' };

// Depende de la sesión en cada petición.
export const instant = false;

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('');
}

/** Correo que, si no cabe, se parte solo después de la «@», nunca a mitad de palabra. */
function Correo({ valor }: { readonly valor: string }) {
  const arroba = valor.indexOf('@');
  if (arroba < 0) return <p className="text-sm text-muted-foreground">{valor}</p>;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="whitespace-nowrap">{valor.slice(0, arroba + 1)}</span>
      <wbr />
      <span className="whitespace-nowrap">{valor.slice(arroba + 1)}</span>
    </p>
  );
}

export default async function PaginaDeUsuarios() {
  const sesion = await sesionDeLaPeticion();
  const resultado = await casosDeUso().listarUsuariosDelDespacho(sesion);

  if (!resultado.ok) {
    return (
      <Encabezado titulo="Usuarios del despacho" descripcion={resultado.error.mensajeUsuario} />
    );
  }

  const { miembros, invitacionesPendientes } = resultado.value;
  const activos = miembros.filter((m) => m.activa).length;

  return (
    <>
      <Encabezado
        titulo="Usuarios del despacho"
        descripcion="Invita a tu equipo, asigna su rol y desactiva las cuentas que ya no se usan. Desactivar no borra nada: la persona deja de entrar y puedes reactivarla después."
      />

      <section aria-labelledby="titulo-invitar" className="flex flex-col gap-3">
        <TituloDeSeccion id="titulo-invitar">Invitar a una persona</TituloDeSeccion>
        <FormularioDeInvitacion />
      </section>

      {invitacionesPendientes.length > 0 ? (
        <section aria-labelledby="titulo-pendientes" className="flex flex-col gap-3">
          <TituloDeSeccion id="titulo-pendientes" detalle={`${invitacionesPendientes.length}`}>
            Invitaciones pendientes
          </TituloDeSeccion>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {invitacionesPendientes.map((invitacion) => (
              <li
                key={invitacion.id}
                className="flex flex-col gap-2 px-5 py-3.5 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium break-all">{invitacion.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {nombreDelRol(invitacion.rol)} · vence el{' '}
                    <span className="cifras">{formatearDia(invitacion.expiraEn)}</span>
                  </p>
                </div>
                <BotonCancelarInvitacion invitacionId={invitacion.id} email={invitacion.email} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="titulo-miembros" className="flex flex-col gap-3">
        <TituloDeSeccion
          id="titulo-miembros"
          detalle={`${activos} ${activos === 1 ? 'activa' : 'activas'} de ${miembros.length}`}
        >
          Personas con cuenta
        </TituloDeSeccion>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {miembros.map((miembro) => (
            <li
              key={miembro.membresiaId}
              className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  aria-hidden
                  className={
                    miembro.activa
                      ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground'
                      : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground'
                  }
                >
                  {iniciales(miembro.nombre)}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                    <span className={miembro.activa ? '' : 'text-muted-foreground'}>
                      {miembro.nombre}
                    </span>
                    {miembro.membresiaId === sesion.membresiaId ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        Tu cuenta
                      </span>
                    ) : null}
                    {miembro.activa ? null : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Desactivada
                      </span>
                    )}
                  </p>
                  <Correo valor={miembro.email} />
                  <p className="text-xs text-muted-foreground">
                    {nombreDelRol(miembro.rol)} · desde el{' '}
                    <span className="cifras">{formatearDia(miembro.desde)}</span>
                  </p>
                </div>
              </div>
              <ControlesDeMiembro
                membresiaId={miembro.membresiaId}
                nombre={miembro.nombre}
                rol={miembro.rol}
                activa={miembro.activa}
                esPropia={miembro.membresiaId === sesion.membresiaId}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
