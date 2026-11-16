import { describe, expect, it, vi } from 'vitest';
import {
  crearCambiarEstadoDeDespacho,
  crearCrearDespacho,
  crearListarDespachos,
} from '@/modules/despachos/application/administrar-despachos';
import type { RepositorioDeDespachos } from '@/modules/despachos/application/puertos';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { CorreoSaliente } from '@/modules/notificaciones/domain/enviador-de-correos';
import { ok, err } from '@/shared/domain/result';
import type { Invitacion } from '../domain/invitacion';
import type { RolDeDespacho } from '../domain/rol-de-despacho';
import {
  crearCambiarEstadoDeCuenta,
  crearCambiarRol,
  crearListarUsuariosDelDespacho,
} from './administrar-cuentas';
import type { ContextoDeSesion, ContextoMiembro } from './contexto-de-sesion';
import {
  crearAceptarInvitacion,
  crearInvitarUsuario,
  type DependenciasDeInvitaciones,
} from './invitaciones';
import type {
  LimitadorDeIntentos,
  MiembroDelDespacho,
  RepositorioDeInvitaciones,
  RepositorioDeMembresias,
  ServicioDeAutenticacion,
  UsuarioResumen,
} from './puertos';
import { crearIniciarSesion } from './sesion';

/**
 * Casos de uso de la Fase 2 con dobles en memoria: verifican que cada uno consulta la matriz
 * de permisos en el servidor, aplica las reglas de cuenta y deja rastro en la auditoría.
 */

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };

function miembro(rol: RolDeDespacho, membresiaId = `m-${rol}`): ContextoMiembro {
  return {
    usuarioId: `u-${membresiaId}`,
    nombre: `Persona ${rol}`,
    email: `${rol}@demo.test`,
    perfil: rol,
    despacho: DESPACHO,
    membresiaId,
  };
}

const SUPERADMIN: ContextoDeSesion = {
  usuarioId: 'u-super',
  nombre: 'Operador',
  email: 'op@luris.test',
  perfil: 'superadmin',
  despacho: null,
  membresiaId: null,
};

function crearEscenario(inicial: MiembroDelDespacho[] = []) {
  const miembros = new Map(inicial.map((m) => [m.membresiaId, { ...m }]));
  const usuarios = new Map<string, UsuarioResumen>(
    inicial.map((m) => [
      m.email,
      { id: m.usuarioId, nombre: m.nombre, email: m.email, esSuperadmin: false },
    ]),
  );
  const invitacionesGuardadas: Invitacion[] = [];
  const eventos: EventoDeAuditoria[] = [];
  const correos: CorreoSaliente[] = [];

  const membresias: RepositorioDeMembresias = {
    buscarDelUsuario: async () => null,
    primerDespachoDisponible: async () => ({ despachoId: DESPACHO.id }),
    listar: async () => [...miembros.values()],
    buscar: async (_d, id) => miembros.get(id) ?? null,
    contarAdministradoresActivos: async () =>
      [...miembros.values()].filter((m) => m.rol === 'administrador' && m.activa).length,
    cambiarRol: async (_d, id, rol) => {
      const m = miembros.get(id);
      if (m) miembros.set(id, { ...m, rol });
    },
    cambiarActiva: async (_d, id, activa) => {
      const m = miembros.get(id);
      if (m) miembros.set(id, { ...m, activa });
    },
    esMiembro: async (_d, usuarioId) =>
      [...miembros.values()].some((m) => m.usuarioId === usuarioId),
  };

  const invitaciones: RepositorioDeInvitaciones = {
    crear: async (nueva) => {
      const invitacion: Invitacion = {
        id: `i-${invitacionesGuardadas.length + 1}`,
        despachoId: nueva.despachoId,
        email: nueva.email,
        rol: nueva.rol,
        estado: 'PENDIENTE',
        expiraEn: nueva.expiraEn,
        creadaEn: new Date(),
      };
      invitacionesGuardadas.push(invitacion);
      return invitacion;
    },
    buscarPorTokenHash: async () => null,
    listar: async () => invitacionesGuardadas,
    cancelar: async () => true,
    aceptar: async () => ({ aceptada: true, membresiaId: 'm-nueva' }),
  };

  const autenticacion: ServicioDeAutenticacion = {
    iniciarSesion: vi.fn(async () => err('CREDENCIALES_INVALIDAS' as const)),
    cerrarSesion: vi.fn(async () => undefined),
    sesionActual: vi.fn(async () => null),
    revocarSesion: vi.fn(async () => undefined),
    establecerDespachoActivo: vi.fn(async () => undefined),
    solicitarRecuperacion: vi.fn(async () => undefined),
    restablecerContrasena: vi.fn(async () => ok(undefined)),
    crearUsuarioConContrasena: vi.fn(async () => ({ usuarioId: 'u-creado' })),
  };

  const deps: DependenciasDeInvitaciones = {
    invitaciones,
    membresias,
    usuarios: {
      buscarPorId: async (id) => [...usuarios.values()].find((u) => u.id === id) ?? null,
      buscarPorEmail: async (email) => usuarios.get(email) ?? null,
    },
    autenticacion,
    correos: {
      enviar: async (correo) => {
        correos.push(correo);
        return ok(undefined);
      },
    },
    tokens: { generar: () => 'token-secreto', hash: (t) => `hash(${t})` },
    reloj: { ahora: () => new Date('2026-11-14T15:00:00Z') },
    auditoria: { registrar: async (evento) => void eventos.push(evento) },
    urlBase: 'https://luris.test',
    horasDeVigencia: 72,
  };

  return { deps, miembros, usuarios, invitacionesGuardadas, eventos, correos, autenticacion };
}

function fila(rol: RolDeDespacho, membresiaId: string, activa = true): MiembroDelDespacho {
  return {
    membresiaId,
    usuarioId: `u-${membresiaId}`,
    nombre: `Persona ${membresiaId}`,
    email: `${membresiaId}@demo.test`,
    rol,
    activa,
    desde: new Date('2026-01-01'),
  };
}

const PERFILES_SIN_GESTION: ContextoDeSesion[] = [
  miembro('abogado'),
  miembro('asistente'),
  SUPERADMIN,
];

describe('administración de cuentas: permisos en el servidor', () => {
  it.each(PERFILES_SIN_GESTION)(
    '$perfil no puede listar, invitar, cambiar roles ni desactivar',
    async (contexto) => {
      const { deps, eventos } = crearEscenario([fila('abogado', 'm-1')]);
      const cuentas = {
        membresias: deps.membresias,
        invitaciones: deps.invitaciones,
        auditoria: deps.auditoria,
      };

      const resultados = await Promise.all([
        crearListarUsuariosDelDespacho(cuentas)(contexto),
        crearInvitarUsuario(deps)(contexto, { email: 'x@demo.test', rol: 'abogado', ip: null }),
        crearCambiarRol(cuentas)(contexto, { membresiaId: 'm-1', rol: 'asistente', ip: null }),
        crearCambiarEstadoDeCuenta(cuentas)(contexto, {
          membresiaId: 'm-1',
          activa: false,
          ip: null,
        }),
      ]);
      for (const resultado of resultados) {
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.error.codigo).toBe('SIN_PERMISO');
      }
      expect(eventos).toHaveLength(0);
    },
  );
});

describe('invitarUsuario', () => {
  it('crea la invitación, envía el enlace con el token y guarda solo su hash', async () => {
    const { deps, invitacionesGuardadas, correos, eventos } = crearEscenario();
    const crear = vi.spyOn(deps.invitaciones, 'crear');

    const resultado = await crearInvitarUsuario(deps)(miembro('administrador'), {
      email: 'nueva@demo.test',
      rol: 'asistente',
      ip: '1.2.3.4',
    });

    expect(resultado.ok).toBe(true);
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: 'hash(token-secreto)' }),
    );
    expect(invitacionesGuardadas[0]?.expiraEn).toEqual(new Date('2026-11-17T15:00:00Z'));
    expect(correos[0]?.para).toBe('nueva@demo.test');
    expect(correos[0]?.texto).toContain('https://luris.test/invitacion/token-secreto');
    expect(eventos.map((e) => e.accion)).toEqual(['INVITACION_ENVIADA']);
    expect(JSON.stringify(eventos)).not.toContain('token-secreto');
  });

  it('rechaza invitar a alguien que ya es miembro del despacho', async () => {
    const { deps } = crearEscenario([fila('abogado', 'm-1')]);
    const resultado = await crearInvitarUsuario(deps)(miembro('administrador'), {
      email: 'm-1@demo.test',
      rol: 'abogado',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('YA_ES_MIEMBRO');
  });
});

describe('cambiarRol y cambiarEstadoDeCuenta', () => {
  const actor = miembro('administrador', 'm-admin');

  it('el administrador cambia el rol de otra persona y queda auditado', async () => {
    const { deps, miembros, eventos } = crearEscenario([
      fila('administrador', 'm-admin'),
      fila('abogado', 'm-1'),
    ]);
    const resultado = await crearCambiarRol(deps)(actor, {
      membresiaId: 'm-1',
      rol: 'asistente',
      ip: null,
    });
    expect(resultado.ok).toBe(true);
    expect(miembros.get('m-1')?.rol).toBe('asistente');
    expect(eventos[0]).toMatchObject({
      accion: 'ROL_CAMBIADO',
      datos: { rolAnterior: 'abogado', rolNuevo: 'asistente' },
    });
  });

  it('no deja el despacho sin administradores activos', async () => {
    const { deps } = crearEscenario([
      fila('administrador', 'm-admin'),
      fila('administrador', 'm-otro', false),
    ]);
    const otroAdmin = miembro('administrador', 'm-3');
    const resultado = await crearCambiarEstadoDeCuenta(deps)(otroAdmin, {
      membresiaId: 'm-admin',
      activa: false,
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('ULTIMO_ADMINISTRADOR');
  });

  it('no encuentra membresías de otro despacho (no las filtra el cliente aislado)', async () => {
    const { deps } = crearEscenario([fila('administrador', 'm-admin')]);
    const resultado = await crearCambiarRol(deps)(actor, {
      membresiaId: 'm-ajena',
      rol: 'abogado',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('iniciarSesion', () => {
  function montar() {
    const escenario = crearEscenario();
    const fallos = new Map<string, number>();
    const limitador: LimitadorDeIntentos = {
      minutosDeBloqueo: (clave) => ((fallos.get(clave) ?? 0) >= 2 ? 15 : 0),
      registrarFallo: (clave) => void fallos.set(clave, (fallos.get(clave) ?? 0) + 1),
      limpiar: (clave) => void fallos.delete(clave),
    };
    const iniciar = crearIniciarSesion({ ...escenario.deps, limitador });
    return { ...escenario, iniciar };
  }

  it('responde con un mensaje claro y bloquea tras varios fallos', async () => {
    const { iniciar, eventos } = montar();
    const datos = { email: 'a@demo.test', contrasena: 'mala', ip: '9.9.9.9' };

    const primero = await iniciar(datos);
    expect(!primero.ok && primero.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    await iniciar(datos);
    const bloqueado = await iniciar(datos);
    expect(!bloqueado.ok && bloqueado.error.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(eventos.filter((e) => e.accion === 'SESION_FALLIDA')).toHaveLength(2);
  });

  it('el superadmin entra al panel de plataforma', async () => {
    const { iniciar, autenticacion, usuarios } = montar();
    usuarios.set('op@luris.test', {
      id: 'u-super',
      nombre: 'Op',
      email: 'op@luris.test',
      esSuperadmin: true,
    });
    vi.mocked(autenticacion.iniciarSesion).mockResolvedValueOnce(
      ok({ usuarioId: 'u-super', tokenDeSesion: 't' }),
    );
    const resultado = await iniciar({ email: 'op@luris.test', contrasena: 'x', ip: null });
    expect(resultado).toEqual({ ok: true, value: { destino: '/plataforma/despachos' } });
  });

  it('sin despacho disponible revoca la sesión recién creada', async () => {
    const { iniciar, autenticacion, deps } = montar();
    vi.spyOn(deps.membresias, 'primerDespachoDisponible').mockResolvedValue({
      despachoId: null,
      motivo: 'SUSPENDIDO',
    });
    vi.mocked(autenticacion.iniciarSesion).mockResolvedValueOnce(
      ok({ usuarioId: 'u-1', tokenDeSesion: 't-1' }),
    );
    const resultado = await iniciar({ email: 'a@demo.test', contrasena: 'x', ip: null });
    expect(!resultado.ok && resultado.error.codigo).toBe('DESPACHO_SUSPENDIDO');
    expect(autenticacion.revocarSesion).toHaveBeenCalledWith('t-1');
  });
});

describe('aceptarInvitacion', () => {
  it('rechaza un enlace inexistente, vencido o usado con un mensaje claro', async () => {
    const { deps } = crearEscenario();
    const resultado = await crearAceptarInvitacion(deps)({
      token: 'no-existe',
      nombre: 'Ana',
      contrasena: 'Contrasena-1234',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('INVITACION_INVALIDA');
  });
});

describe('despachos (superadmin)', () => {
  function repositorio(): RepositorioDeDespachos {
    return {
      crear: vi.fn(async (d) => ({
        despacho: { id: 'd-nuevo', nombre: d.nombre, estado: 'ACTIVO' as const },
      })),
      listar: vi.fn(async () => []),
      buscar: vi.fn(async () => ({ id: 'd-1', nombre: 'D', estado: 'ACTIVO' as const })),
      cambiarEstado: vi.fn(async () => undefined),
    };
  }

  it.each([miembro('administrador'), miembro('abogado'), miembro('asistente')])(
    '$perfil no puede crear, listar ni suspender despachos',
    async (contexto) => {
      const { deps } = crearEscenario();
      const despachos = repositorio();
      const base = { despachos, auditoria: deps.auditoria };
      const resultados = await Promise.all([
        crearListarDespachos(base)(contexto),
        crearCrearDespacho({ ...base, invitaciones: deps })(contexto, {
          nombre: 'Nuevo',
          nit: null,
          emailAdministrador: 'a@b.co',
          ip: null,
        }),
        crearCambiarEstadoDeDespacho(base)(contexto, {
          despachoId: 'd-1',
          estado: 'SUSPENDIDO',
          ip: null,
        }),
      ]);
      resultados.forEach((r) => expect(!r.ok && r.error.codigo).toBe('SIN_PERMISO'));
      expect(despachos.crear).not.toHaveBeenCalled();
      expect(despachos.cambiarEstado).not.toHaveBeenCalled();
    },
  );

  it('el superadmin crea el despacho e invita a su primer administrador', async () => {
    const { deps, correos, eventos } = crearEscenario();
    const despachos = repositorio();
    const resultado = await crearCrearDespacho({
      despachos,
      auditoria: deps.auditoria,
      invitaciones: deps,
    })(SUPERADMIN, {
      nombre: 'Gómez & Asociados',
      nit: '9001234567',
      emailAdministrador: 'jefa@gomez.test',
      ip: null,
    });
    expect(resultado).toEqual({ ok: true, value: { despachoId: 'd-nuevo', correoEnviado: true } });
    expect(despachos.crear).toHaveBeenCalledWith({
      nombre: 'Gómez & Asociados',
      slug: 'gomez-asociados',
      nit: '9001234567',
    });
    expect(correos[0]?.texto).toContain('Administrador del despacho');
    expect(eventos.map((e) => e.accion)).toEqual(['DESPACHO_CREADO', 'INVITACION_ENVIADA']);
  });

  it('el superadmin suspende un despacho y queda auditado', async () => {
    const { deps, eventos } = crearEscenario();
    const despachos = repositorio();
    const resultado = await crearCambiarEstadoDeDespacho({ despachos, auditoria: deps.auditoria })(
      SUPERADMIN,
      {
        despachoId: 'd-1',
        estado: 'SUSPENDIDO',
        ip: null,
      },
    );
    expect(resultado.ok).toBe(true);
    expect(despachos.cambiarEstado).toHaveBeenCalledWith('d-1', 'SUSPENDIDO');
    expect(eventos[0]?.accion).toBe('DESPACHO_SUSPENDIDO');
  });
});
