import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Logger } from '@/shared/domain/logger';
import { LONGITUD_MAXIMA_CONTRASENA, LONGITUD_MINIMA_CONTRASENA } from '../../domain/esquemas';

/**
 * Configuración de Better Auth sobre las tablas de LURIS.
 *
 * - Usuario, Sesion, Cuenta y Verificacion son las tablas base de Better Auth con nombres en
 *   español; Despacho, Membresia e Invitacion son las del plugin de organizaciones
 *   (organización = despacho, miembro = membresía).
 * - Los ids los genera Prisma (UUID v7, `@default(uuid(7))`), no Better Auth.
 * - No hay registro abierto: las cuentas nacen solo por invitación (§5).
 * - LURIS NO expone las rutas HTTP de Better Auth (no existe `/api/auth/[...all]`): todo pasa por
 *   server actions que llaman a `auth.api` desde los casos de uso, donde se verifican los
 *   permisos del §5. Así los endpoints del plugin de organizaciones (invitar, cambiar roles…) no
 *   pueden usarse para saltarse la matriz de permisos.
 */
export interface OpcionesBetterAuth {
  readonly prisma: PrismaClient;
  readonly secreto: string;
  readonly urlBase: string;
  readonly minutosRecuperacion: number;
  readonly logger: Logger;
  /** Envía el correo con el enlace de recuperación. No debe lanzar. */
  readonly enviarRecuperacion: (datos: {
    readonly email: string;
    readonly nombre: string;
    readonly token: string;
  }) => Promise<void>;
  /** Despacho con el que arranca una sesión nueva (organización activa). */
  readonly despachoInicial: (usuarioId: string) => Promise<string | null>;
}

const MARCA_DE_TIEMPO = { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } as const;

/**
 * Roles del plugin alineados con los de LURIS. Solo existen para que el plugin conozca los
 * valores de `membresias.rol`; los permisos reales están en la matriz del §5.
 */
const controlDeAcceso = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
} as const);

const ROLES_DEL_PLUGIN = {
  administrador: controlDeAcceso.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
  }),
  abogado: controlDeAcceso.newRole({}),
  asistente: controlDeAcceso.newRole({}),
};

export function crearBetterAuth(opciones: OpcionesBetterAuth) {
  const logger = opciones.logger.child({ modulo: 'better-auth' });

  return betterAuth({
    appName: 'LURIS',
    baseURL: opciones.urlBase,
    secret: opciones.secreto,
    database: prismaAdapter(opciones.prisma, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      // Better Auth pasa mensajes técnicos; nunca credenciales. El logger de LURIS oculta
      // además cualquier clave sensible.
      log: (nivel, mensaje) => {
        if (nivel === 'error') logger.error(mensaje);
        else if (nivel === 'warn') logger.warn(mensaje);
        else logger.debug(mensaje);
      },
    },
    // Solo el propio origen puede pedir acciones con la sesión (defensa extra contra CSRF; las
    // server actions de Next.js ya comparan además el origen de cada petición).
    trustedOrigins: [opciones.urlBase],
    advanced: {
      cookiePrefix: 'luris',
      database: { generateId: false },
      // Cookies solo por HTTPS cuando LURIS se sirve por HTTPS (siempre, en producción).
      useSecureCookies: opciones.urlBase.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },

    user: {
      modelName: 'usuario',
      fields: {
        name: 'nombre',
        emailVerified: 'emailVerificado',
        image: 'imagen',
        ...MARCA_DE_TIEMPO,
      },
      additionalFields: {
        esSuperadmin: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    session: {
      modelName: 'sesion',
      // La sesión dura 7 días y se renueva si se usa; desactivar una cuenta la cierra al instante.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      fields: {
        expiresAt: 'expiraEn',
        ipAddress: 'direccionIp',
        userAgent: 'agenteDeUsuario',
        userId: 'usuarioId',
        ...MARCA_DE_TIEMPO,
      },
    },
    account: {
      modelName: 'cuenta',
      fields: {
        accountId: 'idEnProveedor',
        providerId: 'proveedor',
        userId: 'usuarioId',
        accessToken: 'tokenDeAcceso',
        refreshToken: 'tokenDeRenovacion',
        idToken: 'tokenDeIdentidad',
        accessTokenExpiresAt: 'accesoExpiraEn',
        refreshTokenExpiresAt: 'renovacionExpiraEn',
        scope: 'alcance',
        password: 'contrasenaHash',
        ...MARCA_DE_TIEMPO,
      },
    },
    verification: {
      modelName: 'verificacion',
      fields: {
        identifier: 'identificador',
        value: 'valor',
        expiresAt: 'expiraEn',
        ...MARCA_DE_TIEMPO,
      },
    },

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: LONGITUD_MINIMA_CONTRASENA,
      maxPasswordLength: LONGITUD_MAXIMA_CONTRASENA,
      resetPasswordTokenExpiresIn: opciones.minutosRecuperacion * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        // Sin await: el tiempo de respuesta no debe revelar si la cuenta existe.
        void opciones.enviarRecuperacion({ email: user.email, nombre: user.name, token });
      },
    },

    databaseHooks: {
      session: {
        create: {
          before: async (sesion) => ({
            data: {
              ...sesion,
              activeOrganizationId: await opciones.despachoInicial(sesion.userId),
            },
          }),
        },
      },
    },

    plugins: [
      organization({
        ac: controlDeAcceso,
        roles: ROLES_DEL_PLUGIN,
        creatorRole: 'administrador',
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        schema: {
          session: { fields: { activeOrganizationId: 'despachoActivoId' } },
          organization: {
            modelName: 'despacho',
            fields: { name: 'nombre', createdAt: 'creadoEn' },
          },
          member: {
            modelName: 'membresia',
            fields: {
              organizationId: 'despachoId',
              userId: 'usuarioId',
              role: 'rol',
              createdAt: 'creadoEn',
            },
          },
          invitation: {
            modelName: 'invitacion',
            fields: {
              organizationId: 'despachoId',
              role: 'rol',
              status: 'estado',
              expiresAt: 'expiraEn',
              inviterId: 'invitadoPorId',
              createdAt: 'creadoEn',
            },
          },
        },
      }),
      // Debe ir al final: escribe las cookies de sesión desde las server actions.
      nextCookies(),
    ],
  });
}

export type InstanciaBetterAuth = ReturnType<typeof crearBetterAuth>;
