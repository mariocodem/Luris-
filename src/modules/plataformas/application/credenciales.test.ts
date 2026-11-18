import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import { ErrorPlataforma } from '../domain/errores';
import type { CodigoPlataforma, EstadoConsulta } from '../domain/plataforma';
import type { VerificadorDeAcceso } from '../domain/puertos';
import { identificadorPara } from './solicitar-consulta';
import {
  crearEliminarCredencial,
  crearGuardarCredencial,
  crearListarCredenciales,
  crearVerificarCredencial,
} from './credenciales';
import type {
  CifradorDeCredenciales,
  ColaDeTrabajos,
  CredencialCifrada,
  RepositorioDeCredenciales,
} from './puertos';

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
/**
 * Doble del cifrador (el real, AES-256-GCM, se prueba en su propio módulo): invierte el texto y
 * exige el mismo contexto para descifrar.
 */
const cifrador: CifradorDeCredenciales = {
  cifrar: (texto, contexto) => ({
    datos: new TextEncoder().encode(`${contexto}\u0000${[...texto].reverse().join('')}`),
    version: 1,
  }),
  descifrar: (secreto, contexto) => {
    const [ctx, invertido] = new TextDecoder().decode(secreto.datos).split('\u0000');
    return ctx === contexto && invertido !== undefined ? [...invertido].reverse().join('') : null;
  },
};
const silencioso: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silencioso,
};

function sesion(rol: RolDeDespacho, membresiaId = `m-${rol}`): ContextoMiembro {
  return {
    usuarioId: `u-${membresiaId}`,
    nombre: rol,
    email: `${rol}@demo.test`,
    perfil: rol,
    despacho: DESPACHO,
    membresiaId,
  };
}

function escenario(opciones: { cifrado?: boolean } = {}) {
  const filas = new Map<string, CredencialCifrada & { estado: EstadoConsulta | null }>();
  const verificaciones: string[] = [];
  const eventos: EventoDeAuditoria[] = [];
  const credenciales: RepositorioDeCredenciales = {
    async listar(_d, { membresiaId, incluirDelDespacho }) {
      return [...filas.values()]
        .filter(
          (c) =>
            (c.alcance === 'PERSONAL' && c.membresiaId === membresiaId) ||
            (incluirDelDespacho && c.alcance === 'DESPACHO'),
        )
        .map((c) => ({
          id: c.id,
          plataforma: c.plataforma,
          alcance: c.alcance,
          usuario: c.usuario,
          membresiaId: c.membresiaId,
          titular: c.membresiaId,
          consentimientoEn: new Date(),
          actualizadoEn: new Date(),
          verificadaEn: null,
          estadoVerificacion: c.estado,
          codigoSolicitadoEn: c.codigoSolicitadoEn,
        }));
    },
    buscar: async (_d, id) => filas.get(id) ?? null,
    async guardar(despachoId, datos) {
      const id = `c-${datos.alcance}-${datos.membresiaId}`;
      filas.set(id, {
        id,
        despachoId,
        ...datos,
        sesion: null,
        codigoSolicitadoEn: null,
        estado: null,
      });
      return { id };
    },
    async eliminar(_d, id) {
      filas.delete(id);
    },
    async registrarVerificacion(_d, id, estado) {
      const fila = filas.get(id);
      if (fila) fila.estado = estado;
    },
    paraProceso: () => Promise.resolve([]),
    guardarSesion: () => Promise.resolve(),
    marcarCodigoSolicitado: () => Promise.resolve(),
  };
  const cola = {
    async encolarVerificacion({ credencialId }: { credencialId: string }) {
      verificaciones.push(credencialId);
    },
  } as unknown as ColaDeTrabajos;
  const deps = {
    credenciales,
    cifrador: opciones.cifrado === false ? null : cifrador,
    cola,
    auditoria: { registrar: async (e: EventoDeAuditoria) => void eventos.push(e) },
    reloj: { ahora: () => new Date('2026-11-17T10:00:00Z') },
  };
  return {
    guardar: crearGuardarCredencial(deps),
    listar: crearListarCredenciales(deps),
    eliminar: crearEliminarCredencial(deps),
    filas,
    verificaciones,
    eventos,
  };
}

const NUEVA = {
  plataforma: 'SAMAI',
  alcance: 'PERSONAL',
  usuario: 'abogada.samai',
  secreto: 'clave-secreta',
  consiente: true,
  ip: '10.0.0.1',
} as const;

describe('guardar credenciales', () => {
  it('guarda cifrado, pide probar el acceso y audita sin el secreto', async () => {
    const { guardar, filas, verificaciones, eventos } = escenario();
    const r = await guardar(sesion('abogado'), NUEVA);
    if (!r.ok) throw r.error;
    const fila = filas.get(r.value.id);
    expect(Buffer.from(fila?.secreto.datos ?? []).toString('utf8')).not.toContain('clave-secreta');
    expect(verificaciones).toEqual([r.value.id]);
    expect(eventos).toEqual([
      expect.objectContaining({
        accion: 'CREDENCIAL_GUARDADA',
        datos: { plataforma: 'SAMAI', alcance: 'PERSONAL' },
      }),
    ]);
    expect(JSON.stringify(eventos)).not.toContain('clave-secreta');
  });

  it('sin consentimiento explícito no se guarda', async () => {
    const { guardar, filas } = escenario();
    const r = await guardar(sesion('abogado'), { ...NUEVA, consiente: false });
    expect(r.ok || r.error.codigo).toBe('VALIDACION');
    expect(filas.size).toBe(0);
  });

  it('el abogado no puede guardar una del despacho; el administrador sí', async () => {
    const { guardar } = escenario();
    const abogado = await guardar(sesion('abogado'), { ...NUEVA, alcance: 'DESPACHO' });
    expect(abogado.ok || abogado.error.codigo).toBe('SIN_PERMISO');
    const admin = await guardar(sesion('administrador'), { ...NUEVA, alcance: 'DESPACHO' });
    expect(admin.ok).toBe(true);
  });

  it('el asistente no gestiona credenciales', async () => {
    const { guardar, listar } = escenario();
    expect((await guardar(sesion('asistente'), NUEVA)).ok).toBe(false);
    const lista = await listar(sesion('asistente'));
    expect(lista.ok || lista.error.codigo).toBe('SIN_PERMISO');
  });

  it('sin clave de cifrado en el servidor, lo explica y no guarda nada', async () => {
    const { guardar, filas } = escenario({ cifrado: false });
    const r = await guardar(sesion('abogado'), NUEVA);
    expect(r.ok || r.error.codigo).toBe('CIFRADO_NO_CONFIGURADO');
    expect(filas.size).toBe(0);
  });
});

describe('ver y eliminar credenciales', () => {
  it('cada abogado ve solo las suyas; el administrador, también las del despacho', async () => {
    const { guardar, listar } = escenario();
    await guardar(sesion('abogado'), NUEVA);
    await guardar(sesion('administrador'), { ...NUEVA, alcance: 'DESPACHO' });
    await guardar(sesion('abogado', 'm-otra'), NUEVA);

    const delAbogado = await listar(sesion('abogado'));
    expect(delAbogado.ok && delAbogado.value.map((c) => c.id)).toEqual(['c-PERSONAL-m-abogado']);
    const delAdmin = await listar(sesion('administrador'));
    expect(delAdmin.ok && delAdmin.value.map((c) => c.alcance)).toEqual(['DESPACHO']);
  });

  it('un abogado no puede eliminar la credencial de otro; el administrador sí', async () => {
    const { guardar, eliminar, filas, eventos } = escenario();
    const ajena = await guardar(sesion('abogado', 'm-otra'), NUEVA);
    if (!ajena.ok) throw ajena.error;

    const intento = await eliminar(sesion('abogado'), { id: ajena.value.id, ip: null });
    expect(intento.ok || intento.error.codigo).toBe('NO_ENCONTRADO');
    expect(filas.has(ajena.value.id)).toBe(true);

    expect((await eliminar(sesion('administrador'), { id: ajena.value.id, ip: null })).ok).toBe(
      true,
    );
    expect(filas.has(ajena.value.id)).toBe(false);
    expect(eventos.at(-1)).toMatchObject({ accion: 'CREDENCIAL_ELIMINADA' });
  });
});

describe('probar el acceso', () => {
  function verificador(resultado: Awaited<ReturnType<VerificadorDeAcceso['verificar']>>) {
    const recibidos: string[] = [];
    const v: VerificadorDeAcceso = {
      plataforma: 'SAMAI',
      async verificar(usuario, secreto) {
        recibidos.push(`${usuario}:${secreto}`);
        return resultado;
      },
    };
    return { v, recibidos };
  }

  async function probar(resultado: Awaited<ReturnType<VerificadorDeAcceso['verificar']>>) {
    const e = escenario();
    const guardada = await e.guardar(sesion('abogado'), NUEVA);
    if (!guardada.ok) throw guardada.error;
    const { v, recibidos } = verificador(resultado);
    const verificar = crearVerificarCredencial({
      credenciales: escenarioRepo(e),
      cifrador,
      verificadores: new Map<CodigoPlataforma, VerificadorDeAcceso>([['SAMAI', v]]),
      reloj: { ahora: () => new Date() },
      logger: silencioso,
    });
    const r = await verificar({ despachoId: DESPACHO.id, credencialId: guardada.value.id }, {});
    return { r, recibidos, estado: e.filas.get(guardada.value.id)?.estado };
  }

  function escenarioRepo(e: ReturnType<typeof escenario>): RepositorioDeCredenciales {
    return {
      listar: () => Promise.resolve([]),
      buscar: async (_d, id) => e.filas.get(id) ?? null,
      guardar: () => Promise.reject(new Error('no se usa')),
      eliminar: () => Promise.resolve(),
      async registrarVerificacion(_d, id, estado) {
        const fila = e.filas.get(id);
        if (fila) fila.estado = estado;
      },
      paraProceso: () => Promise.resolve([]),
      guardarSesion: () => Promise.resolve(),
      marcarCodigoSolicitado: () => Promise.resolve(),
    };
  }

  it('descifra solo para usarla y registra el acceso verificado', async () => {
    const { r, recibidos, estado } = await probar(ok({ sesion: null }));
    expect(r.ok).toBe(true);
    expect(recibidos).toEqual(['abogada.samai:clave-secreta']);
    expect(estado).toBe('EXITOSA');
  });

  it('una contraseña rechazada queda registrada; un fallo pasajero se reintenta', async () => {
    expect((await probar(err(new ErrorPlataforma('SAMAI', 'CREDENCIALES_INVALIDAS')))).estado).toBe(
      'CREDENCIALES_INVALIDAS',
    );
    const pasajero = await probar(err(new ErrorPlataforma('SAMAI', 'PLATAFORMA_NO_DISPONIBLE')));
    expect(pasajero.r.ok).toBe(false);
    expect(pasajero.estado).toBeNull();
  });
});

describe('a qué procesos aplica una plataforma automática', () => {
  const samai = {
    codigo: 'SAMAI',
    identificador: 'RADICADO',
    aplica: (r: string) => r.slice(5, 7) === '23',
  } as const;
  it('respeta el identificador y la regla de la plataforma', () => {
    expect(identificadorPara(samai, { radicado: '05001233300020160013200', nunc: null })).toBe(
      '05001233300020160013200',
    );
    expect(
      identificadorPara(samai, { radicado: '50001400300120210034300', nunc: null }),
    ).toBeNull();
    expect(identificadorPara(samai, { radicado: null, nunc: '110016000049202300123' })).toBeNull();
  });
});
