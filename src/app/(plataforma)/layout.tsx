import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { EsqueletoDeShell } from '@/shared/ui/shell/esqueleto';
import { Shell } from '@/shared/ui/shell/shell';
import { cerrarSesionAccion } from '../(auth)/acciones';
import { sesionDeLaPeticion } from '../_servidor/sesion';

/** Panel del operador de LURIS (superadmin). Nunca muestra datos de procesos de los despachos. */
async function ZonaDePlataforma({ children }: { readonly children: ReactNode }) {
  const sesion = await sesionDeLaPeticion();
  if (sesion.perfil !== 'superadmin') redirect('/inicio');

  return (
    <Shell
      contexto="Operación de la plataforma"
      enlaces={[
        {
          href: '/plataforma/despachos',
          texto: 'Despachos',
          icono: 'despachos',
          principalEnMovil: true,
        },
      ]}
      persona={{ nombre: sesion.nombre, descripcion: 'Operador de LURIS' }}
      cerrarSesion={cerrarSesionAccion}
      rutaDeAjustes={null}
    >
      {children}
    </Shell>
  );
}

export default function LayoutDePlataforma({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<EsqueletoDeShell />}>
      <ZonaDePlataforma>{children}</ZonaDePlataforma>
    </Suspense>
  );
}
