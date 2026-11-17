import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { nombreDelRol } from '@/modules/usuarios/application/correos';
import { puede, type Perfil } from '@/modules/usuarios/domain/permisos';
import { Shell } from '@/shared/ui/shell/shell';
import { EsqueletoDeShell } from '@/shared/ui/shell/esqueleto';
import type { EnlaceDeNavegacion } from '@/shared/ui/shell/tipos';
import { cerrarSesionAccion } from '../(auth)/acciones';
import { sesionDeLaPeticion } from '../_servidor/sesion';

/** Destinos del despacho según el rol (§5). Ocultar no protege: cada página vuelve a verificar. */
function enlacesPara(perfil: Perfil): EnlaceDeNavegacion[] {
  const enlaces: (EnlaceDeNavegacion | false)[] = [
    { href: '/inicio', texto: 'Inicio', icono: 'inicio', principalEnMovil: true },
    { href: '/procesos', texto: 'Procesos', icono: 'procesos', principalEnMovil: true },
    puede(perfil, 'PROCESOS_CONSULTAR') && {
      href: '/pendientes',
      texto: 'Pendientes',
      icono: 'pendientes',
      principalEnMovil: false,
    },
    puede(perfil, 'CONSULTA_MASIVA') && {
      href: '/consulta-masiva',
      texto: 'Consulta masiva',
      icono: 'consulta-masiva',
      principalEnMovil: true,
    },
    {
      href: '/notificaciones',
      texto: 'Notificaciones',
      icono: 'notificaciones',
      principalEnMovil: true,
    },
    puede(perfil, 'CUENTAS_GESTIONAR') && {
      href: '/ajustes/usuarios',
      texto: 'Usuarios',
      icono: 'usuarios',
      principalEnMovil: false,
    },
    { href: '/ajustes', texto: 'Ajustes', icono: 'ajustes', principalEnMovil: false },
  ];
  return enlaces.filter((enlace): enlace is EnlaceDeNavegacion => enlace !== false);
}

/** Área de un despacho. La sesión se lee dentro de <Suspense> (Cache Components). */
async function ZonaDelDespacho({ children }: { readonly children: ReactNode }) {
  const sesion = await sesionDeLaPeticion();
  if (sesion.perfil === 'superadmin') redirect('/plataforma/despachos');

  return (
    <Shell
      contexto={sesion.despacho.nombre}
      enlaces={enlacesPara(sesion.perfil)}
      persona={{ nombre: sesion.nombre, descripcion: nombreDelRol(sesion.perfil) }}
      cerrarSesion={cerrarSesionAccion}
      rutaDeAjustes="/ajustes"
    >
      {children}
    </Shell>
  );
}

export default function LayoutDelDespacho({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<EsqueletoDeShell />}>
      <ZonaDelDespacho>{children}</ZonaDelDespacho>
    </Suspense>
  );
}
