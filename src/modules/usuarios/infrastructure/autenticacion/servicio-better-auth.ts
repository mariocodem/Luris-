import { isAPIError } from 'better-auth/api';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import type { ServicioDeAutenticacion } from '../../application/puertos';
import type { InstanciaBetterAuth } from './better-auth';

/**
 * Adaptador de `ServicioDeAutenticacion` sobre Better Auth. Traduce sus excepciones a
 * resultados del dominio; los detalles técnicos van solo al log.
 */
export function crearServicioBetterAuth(opciones: {
  readonly auth: InstanciaBetterAuth;
  readonly prisma: PrismaClient;
  /** Cabeceras de la petición en curso (cookies incluidas). */
  readonly cabeceras: () => Promise<Headers>;
  readonly logger: Logger;
}): ServicioDeAutenticacion {
  const { auth, prisma, cabeceras } = opciones;
  const logger = opciones.logger.child({ modulo: 'autenticacion' });

  return {
    async iniciarSesion(email, contrasena) {
      try {
        const respuesta = await auth.api.signInEmail({
          body: { email, password: contrasena, rememberMe: true },
          headers: await cabeceras(),
        });
        return ok({ usuarioId: respuesta.user.id, tokenDeSesion: respuesta.token });
      } catch (error) {
        if (isAPIError(error) && (error.statusCode === 401 || error.statusCode === 400)) {
          return err('CREDENCIALES_INVALIDAS');
        }
        throw error;
      }
    },

    async cerrarSesion() {
      try {
        await auth.api.signOut({ headers: await cabeceras() });
      } catch (error) {
        // Sin sesión válida no hay nada que cerrar.
        logger.debug('Cierre de sesión sin sesión activa', { error });
      }
    },

    async sesionActual() {
      const resultado = await auth.api.getSession({ headers: await cabeceras() });
      if (!resultado) return null;
      return {
        sesionId: resultado.session.id,
        usuarioId: resultado.user.id,
        despachoActivoId: resultado.session.activeOrganizationId ?? null,
      };
    },

    async revocarSesion(tokenDeSesion) {
      const contexto = await auth.$context;
      await contexto.internalAdapter.deleteSession(tokenDeSesion);
    },

    async establecerDespachoActivo(tokenDeSesion, despachoId) {
      await prisma.sesion.updateMany({
        where: { token: tokenDeSesion },
        data: { despachoActivoId: despachoId },
      });
    },

    async solicitarRecuperacion(email) {
      try {
        await auth.api.requestPasswordReset({ body: { email } });
      } catch (error) {
        logger.error('No se pudo iniciar la recuperación de contraseña', { error });
      }
    },

    async restablecerContrasena(token, contrasena) {
      try {
        await auth.api.resetPassword({ body: { token, newPassword: contrasena } });
        return ok(undefined);
      } catch (error) {
        if (isAPIError(error) && error.statusCode === 400) return err('TOKEN_INVALIDO');
        throw error;
      }
    },

    async crearUsuarioConContrasena({ nombre, email, contrasena }) {
      const contexto = await auth.$context;
      // El correo queda verificado: la persona llegó desde el enlace enviado a ese correo.
      const usuario = await contexto.internalAdapter.createUser(
        { name: nombre, email, emailVerified: true },
        { method: 'email-password' },
      );
      await contexto.internalAdapter.linkAccount({
        userId: usuario.id,
        providerId: 'credential',
        accountId: usuario.id,
        password: await contexto.password.hash(contrasena),
      });
      return { usuarioId: usuario.id };
    },
  };
}
