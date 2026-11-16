import type { PrismaClient } from '@/generated/prisma/client';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import type { EstadoInvitacion, Invitacion } from '../domain/invitacion';
import { esRolDeDespacho, type RolDeDespacho } from '../domain/rol-de-despacho';
import type {
  MiembroDelDespacho,
  RepositorioDeInvitaciones,
  RepositorioDeMembresias,
  RepositorioDeUsuarios,
} from '../application/puertos';

/**
 * Repositorios de cuentas sobre Prisma.
 * - Lo que pertenece a un despacho pasa por el cliente aislado (`paraDespacho`).
 * - Solo las búsquedas propias de la autenticación (por usuario en todos sus despachos, o por el
 *   token de una invitación antes de tener sesión) usan el cliente sin aislamiento.
 */
export interface AccesoADatos {
  readonly paraDespacho: (despachoId: string) => ClienteDeDespacho;
  readonly sinAislamiento: PrismaClient;
}

function rol(valor: string): RolDeDespacho {
  // La restricción CHECK de la base garantiza el valor; esto protege ante datos inesperados.
  if (!esRolDeDespacho(valor)) throw new Error(`Rol desconocido en la base: ${valor}`);
  return valor;
}

const ESTADO_A_BASE: Readonly<Record<EstadoInvitacion, string>> = {
  PENDIENTE: 'pending',
  ACEPTADA: 'accepted',
  CANCELADA: 'canceled',
};

function estadoDesdeBase(valor: string): EstadoInvitacion {
  if (valor === 'pending') return 'PENDIENTE';
  if (valor === 'accepted') return 'ACEPTADA';
  return 'CANCELADA';
}

interface FilaInvitacion {
  id: string;
  despachoId: string;
  email: string;
  rol: string;
  estado: string;
  expiraEn: Date;
  creadoEn: Date;
}

function aInvitacion(fila: FilaInvitacion): Invitacion {
  return {
    id: fila.id,
    despachoId: fila.despachoId,
    email: fila.email,
    rol: rol(fila.rol),
    estado: estadoDesdeBase(fila.estado),
    expiraEn: fila.expiraEn,
    creadaEn: fila.creadoEn,
  };
}

interface FilaMembresia {
  id: string;
  usuarioId: string;
  rol: string;
  activa: boolean;
  creadoEn: Date;
  usuario: { nombre: string; email: string };
}

function aMiembro(fila: FilaMembresia): MiembroDelDespacho {
  return {
    membresiaId: fila.id,
    usuarioId: fila.usuarioId,
    nombre: fila.usuario.nombre,
    email: fila.usuario.email,
    rol: rol(fila.rol),
    activa: fila.activa,
    desde: fila.creadoEn,
  };
}

const CON_USUARIO = { usuario: { select: { nombre: true, email: true } } } as const;

export function crearRepositorioDeUsuarios(datos: AccesoADatos): RepositorioDeUsuarios {
  const seleccion = { id: true, nombre: true, email: true, esSuperadmin: true } as const;
  return {
    buscarPorId: (usuarioId) =>
      datos.sinAislamiento.usuario.findUnique({ where: { id: usuarioId }, select: seleccion }),
    buscarPorEmail: (email) =>
      datos.sinAislamiento.usuario.findUnique({
        where: { email: email.toLowerCase() },
        select: seleccion,
      }),
  };
}

export function crearRepositorioDeMembresias(datos: AccesoADatos): RepositorioDeMembresias {
  return {
    async buscarDelUsuario(usuarioId, despachoId) {
      const fila = await datos.paraDespacho(despachoId).membresia.findUnique({
        where: { despachoId_usuarioId: { despachoId, usuarioId } },
        include: { ...CON_USUARIO, despacho: { select: { id: true, nombre: true, estado: true } } },
      });
      if (!fila) return null;
      return { miembro: aMiembro(fila), despacho: fila.despacho };
    },

    async primerDespachoDisponible(usuarioId) {
      const membresias = await datos.sinAislamiento.membresia.findMany({
        where: { usuarioId, activa: true },
        select: { despachoId: true, despacho: { select: { estado: true } } },
        orderBy: { creadoEn: 'asc' },
      });
      const disponible = membresias.find((m) => m.despacho.estado === 'ACTIVO');
      if (disponible) return { despachoId: disponible.despachoId };
      return { despachoId: null, motivo: membresias.length > 0 ? 'SUSPENDIDO' : 'SIN_MEMBRESIA' };
    },

    async listar(despachoId) {
      const filas = await datos.paraDespacho(despachoId).membresia.findMany({
        include: CON_USUARIO,
        orderBy: [{ activa: 'desc' }, { usuario: { nombre: 'asc' } }],
      });
      return filas.map(aMiembro);
    },

    async buscar(despachoId, membresiaId) {
      const fila = await datos.paraDespacho(despachoId).membresia.findUnique({
        where: { id: membresiaId },
        include: CON_USUARIO,
      });
      return fila ? aMiembro(fila) : null;
    },

    contarAdministradoresActivos: (despachoId) =>
      datos.paraDespacho(despachoId).membresia.count({
        where: { rol: 'administrador', activa: true },
      }),

    async cambiarRol(despachoId, membresiaId, nuevoRol) {
      await datos
        .paraDespacho(despachoId)
        .membresia.update({ where: { id: membresiaId }, data: { rol: nuevoRol } });
    },

    async cambiarActiva(despachoId, membresiaId, activa) {
      await datos
        .paraDespacho(despachoId)
        .membresia.update({ where: { id: membresiaId }, data: { activa } });
    },

    async esMiembro(despachoId, usuarioId) {
      const total = await datos.paraDespacho(despachoId).membresia.count({ where: { usuarioId } });
      return total > 0;
    },
  };
}

export function crearRepositorioDeInvitaciones(datos: AccesoADatos): RepositorioDeInvitaciones {
  return {
    async crear(nueva) {
      const db = datos.paraDespacho(nueva.despachoId);
      const [, creada] = await db.$transaction([
        db.invitacion.updateMany({
          where: { email: nueva.email, estado: 'pending' },
          data: { estado: 'canceled' },
        }),
        db.invitacion.create({
          data: {
            despachoId: nueva.despachoId,
            email: nueva.email,
            rol: nueva.rol,
            expiraEn: nueva.expiraEn,
            invitadoPorId: nueva.invitadoPorId,
            tokenHash: nueva.tokenHash,
          },
        }),
      ]);
      return aInvitacion(creada);
    },

    async buscarPorTokenHash(tokenHash) {
      const fila = await datos.sinAislamiento.invitacion.findUnique({
        where: { tokenHash },
        include: { despacho: { select: { nombre: true, estado: true } } },
      });
      if (!fila) return null;
      return {
        ...aInvitacion(fila),
        despachoNombre: fila.despacho.nombre,
        despachoEstado: fila.despacho.estado,
      };
    },

    async listar(despachoId, estado) {
      const filas = await datos.paraDespacho(despachoId).invitacion.findMany({
        where: { estado: ESTADO_A_BASE[estado] },
        orderBy: { creadoEn: 'desc' },
      });
      return filas.map(aInvitacion);
    },

    async cancelar(despachoId, invitacionId) {
      const { count } = await datos.paraDespacho(despachoId).invitacion.updateMany({
        where: { id: invitacionId, estado: 'pending' },
        data: { estado: 'canceled' },
      });
      return count > 0;
    },

    async aceptar({ invitacionId, usuarioId, ahora }) {
      const invitacion = await datos.sinAislamiento.invitacion.findUnique({
        where: { id: invitacionId },
        select: { despachoId: true, rol: true },
      });
      if (!invitacion) return { aceptada: false };

      const db = datos.paraDespacho(invitacion.despachoId);
      return db.$transaction(async (tx) => {
        // Condicional: solo una petición puede pasar la invitación de pendiente a aceptada.
        const { count } = await tx.invitacion.updateMany({
          where: { id: invitacionId, estado: 'pending', expiraEn: { gt: ahora } },
          data: { estado: 'accepted', aceptadaEn: ahora },
        });
        if (count === 0) return { aceptada: false as const };

        const membresia = await tx.membresia.create({
          data: { despachoId: invitacion.despachoId, usuarioId, rol: invitacion.rol },
        });
        await tx.preferenciaNotificacion.create({
          data: { despachoId: invitacion.despachoId, membresiaId: membresia.id },
        });
        return { aceptada: true as const, membresiaId: membresia.id };
      });
    },
  };
}
