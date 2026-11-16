'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { LONGITUD_MINIMA_CONTRASENA } from '@/modules/usuarios/domain/esquemas';
import { Button } from '@/shared/ui/components/button';
import { AvisoDeFormulario } from '@/shared/ui/components/aviso-de-formulario';
import { Campo } from '@/shared/ui/components/campo';
import { ESTADO_INICIAL, erroresDe, valorDe } from '@/shared/ui/estado-de-formulario';
import {
  aceptarInvitacionAccion,
  iniciarSesionAccion,
  restablecerContrasenaAccion,
  solicitarRecuperacionAccion,
} from './acciones';

const AYUDA_CONTRASENA = `Mínimo ${LONGITUD_MINIMA_CONTRASENA} caracteres. Una frase fácil de recordar funciona bien.`;

export function FormularioDeInicioDeSesion() {
  const [estado, accion, enviando] = useActionState(iniciarSesionAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <AvisoDeFormulario estado={estado} />
      <Campo
        etiqueta="Correo electrónico"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        defaultValue={valorDe(estado, 'email')}
        errores={erroresDe(estado, 'email')}
      />
      <Campo
        etiqueta="Contraseña"
        name="contrasena"
        type="password"
        autoComplete="current-password"
        required
        errores={erroresDe(estado, 'contrasena')}
      />
      <Button type="submit" size="lg" className="h-10" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Iniciar sesión'}
      </Button>
      <Link
        href="/recuperar-contrasena"
        className="self-start rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}

export function FormularioDeRecuperacion() {
  const [estado, accion, enviando] = useActionState(solicitarRecuperacionAccion, ESTADO_INICIAL);
  if (estado.tipo === 'exito') return <AvisoDeFormulario estado={estado} />;
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <AvisoDeFormulario estado={estado} />
      <Campo
        etiqueta="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={valorDe(estado, 'email')}
        errores={erroresDe(estado, 'email')}
      />
      <Button type="submit" size="lg" className="h-10" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar enlace'}
      </Button>
    </form>
  );
}

export function FormularioDeNuevaContrasena({ token }: { readonly token: string }) {
  const [estado, accion, enviando] = useActionState(restablecerContrasenaAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <AvisoDeFormulario estado={estado} />
      <input type="hidden" name="token" value={token} />
      <Campo
        etiqueta="Contraseña nueva"
        name="contrasena"
        type="password"
        autoComplete="new-password"
        required
        ayuda={AYUDA_CONTRASENA}
        errores={erroresDe(estado, 'contrasena')}
      />
      <Campo
        etiqueta="Repite la contraseña"
        name="confirmacion"
        type="password"
        autoComplete="new-password"
        required
        errores={erroresDe(estado, 'confirmacion')}
      />
      <Button type="submit" size="lg" className="h-10" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}

export function FormularioDeAceptacion({
  token,
  email,
  yaTieneCuenta,
}: {
  readonly token: string;
  readonly email: string;
  readonly yaTieneCuenta: boolean;
}) {
  const [estado, accion, enviando] = useActionState(aceptarInvitacionAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <AvisoDeFormulario estado={estado} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="yaTieneCuenta" value={yaTieneCuenta ? 'si' : 'no'} />
      {/* Ayuda a los gestores de contraseñas a asociar la cuenta. */}
      <input type="hidden" name="email" value={email} autoComplete="username" />
      {yaTieneCuenta ? (
        <Campo
          etiqueta="Tu contraseña de LURIS"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          ayuda="Ya tienes una cuenta con este correo. Escribe tu contraseña para unirte al despacho."
          errores={erroresDe(estado, 'contrasena')}
        />
      ) : (
        <>
          <Campo
            etiqueta="Nombre completo"
            name="nombre"
            autoComplete="name"
            required
            defaultValue={valorDe(estado, 'nombre')}
            errores={erroresDe(estado, 'nombre')}
          />
          <Campo
            etiqueta="Crea tu contraseña"
            name="contrasena"
            type="password"
            autoComplete="new-password"
            required
            ayuda={AYUDA_CONTRASENA}
            errores={erroresDe(estado, 'contrasena')}
          />
          <Campo
            etiqueta="Repite la contraseña"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            required
            errores={erroresDe(estado, 'confirmacion')}
          />
        </>
      )}
      <Button type="submit" size="lg" className="h-10" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Aceptar invitación'}
      </Button>
    </form>
  );
}
