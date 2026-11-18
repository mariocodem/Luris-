import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type { ContextoMiembro } from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import type { Logger } from '@/shared/domain/logger';
import { err, ok } from '@/shared/domain/result';
import { contextoDeCifrado, contextoDeSesion } from '../domain/credenciales';
import type { EstadoConsulta } from '../domain/plataforma';
import type { CompletadorDeIngreso } from '../domain/puertos';
import { esDeLaEspecialidadLaboral } from '../domain/jurisdiccion';
import {
  crearCompletarIngreso,
  crearIngresarCodigoDeAcceso,
  leerCodigoDeAcceso,
} from './codigo-de-acceso';
import { crearProveedorDeCuentas } from './proveedor-de-cuentas';
import type {
  CifradorDeCredenciales,
  ColaDeTrabajos,
  CredencialCifrada,
  RepositorioDeCredenciales,
  RepositorioDeSincronizacion,
  SecretoCifrado,
  SolicitudDeSincronizacion,
} from './puertos';

/**
 * Credenciales con ingreso (SIUGJ): la cuenta con la que se consulta cada proceso, su sesión
 * reutilizable y el código de acceso que escribe la persona (Fase 8).
 */

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };
const AHORA = new Date('2026-11-17T15:00:00Z');
const LABORAL = '05001310500220250012300';
const CIVIL = '11001310300120230012300';

/** Doble del cifrador: invierte el texto y exige el mismo contexto para descifrar. */
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

type Fila = Omit<CredencialCifrada, 'codigoSolicitadoEn'> & {
  codigoSolicitadoEn: Date | null;
  estado: EstadoConsulta | null;
  sesionGuardada: SecretoCifrado | null;
};

function credencial(
  id: string,
  datos: Partial<Pick<Fila, 'alcance' | 'membresiaId' | 'codigoSolicitadoEn'>> = {},
): Fila {
  const base = {
    id,
    despachoId: DESPACHO.id,
    plataforma: 'SIUGJ' as const,
    alcance: datos.alcance ?? ('PERSONAL' as const),
    membresiaId: datos.membresiaId ?? 'm-abogado',
    usuario: `usuario-${id}`,
  };
  return {
    ...base,
    secreto: cifrador.cifrar(`clave-${id}`, contextoDeCifrado(base)),
    sesion: null,
    sesionGuardada: null,
    codigoSolicitadoEn: datos.codigoSolicitadoEn ?? null,
    estado: null,
  };
}

function escenario(filas: Fila[]) {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const repositorio: RepositorioDeCredenciales = {
    listar: () => Promise.resolve([]),
    buscar: async (_d, id) => {
      const fila = porId.get(id);
      return fila ? { ...fila, sesion: fila.sesionGuardada } : null;
    },
    guardar: () => Promise.reject(new Error('no se usa')),
    eliminar: () => Promise.resolve(),
    async registrarVerificacion(_d, id, estado) {
      const fila = porId.get(id);
      if (fila) fila.estado = estado;
    },
    paraProceso: async () => filas.map((f) => ({ ...f, sesion: f.sesionGuardada })),
    async guardarSesion(_d, id, sesion) {
      const fila = porId.get(id);
      if (fila) fila.sesionGuardada = sesion;
    },
    async marcarCodigoSolicitado(_d, id, en) {
      const fila = porId.get(id);
      if (fila) fila.codigoSolicitadoEn = en;
    },
  };
  const codigos: { credencialId: string; codigo: SecretoCifrado }[] = [];
  const sincronizaciones: SolicitudDeSincronizacion[] = [];
  const cola = {
    async encolarCodigoDeAcceso(datos: { credencialId: string; codigo: SecretoCifrado }) {
      codigos.push(datos);
    },
    async encolarSincronizaciones(solicitudes: readonly SolicitudDeSincronizacion[]) {
      sincronizaciones.push(...solicitudes);
      return solicitudes.length;
    },
  } as unknown as ColaDeTrabajos;
  const eventos: EventoDeAuditoria[] = [];
  return { repositorio, porId, cola, codigos, sincronizaciones, eventos };
}

const reloj = { ahora: () => AHORA };
const MINUTOS = 10;

describe('proveedor de cuentas', () => {
  it('usa la primera utilizable en el orden del repositorio y descifra su sesión', async () => {
    const e = escenario([
      credencial('responsable'),
      credencial('despacho', { alcance: 'DESPACHO' }),
    ]);
    const fila = e.porId.get('responsable');
    if (fila)
      fila.sesionGuardada = cifrador.cifrar('{"cookies":[]}', contextoDeSesion('responsable'));
    const proveedor = crearProveedorDeCuentas({
      credenciales: e.repositorio,
      cifrador,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    const cuenta = await proveedor.cuentaPara({ despachoId: DESPACHO.id, procesoId: 'p' }, 'SIUGJ');
    expect(cuenta).toMatchObject({
      credencialId: 'responsable',
      usuario: 'usuario-responsable',
      secreto: 'clave-responsable',
      sesion: '{"cookies":[]}',
      esperandoCodigo: false,
    });
  });

  it('salta la que espera un código vigente; si todas esperan, lo dice', async () => {
    const reciente = new Date(AHORA.getTime() - 2 * 60_000);
    const e = escenario([
      credencial('responsable', { codigoSolicitadoEn: reciente }),
      credencial('despacho', { alcance: 'DESPACHO' }),
    ]);
    const proveedor = crearProveedorDeCuentas({
      credenciales: e.repositorio,
      cifrador,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    const alcance = { despachoId: DESPACHO.id, procesoId: 'p' };
    expect((await proveedor.cuentaPara(alcance, 'SIUGJ'))?.credencialId).toBe('despacho');

    const despacho = e.porId.get('despacho');
    if (despacho) despacho.codigoSolicitadoEn = reciente;
    const cuenta = await proveedor.cuentaPara(alcance, 'SIUGJ');
    expect(cuenta).toMatchObject({ credencialId: 'responsable', esperandoCodigo: true });
  });

  it('una espera vencida ya no bloquea (la próxima consulta pedirá un código nuevo)', async () => {
    const vieja = new Date(AHORA.getTime() - (MINUTOS + 1) * 60_000);
    const e = escenario([credencial('responsable', { codigoSolicitadoEn: vieja })]);
    const proveedor = crearProveedorDeCuentas({
      credenciales: e.repositorio,
      cifrador,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    const cuenta = await proveedor.cuentaPara({ despachoId: DESPACHO.id, procesoId: 'p' }, 'SIUGJ');
    expect(cuenta?.esperandoCodigo).toBe(false);
  });

  it('guarda la sesión cifrada, marca y registra el código y el rechazo', async () => {
    const e = escenario([credencial('responsable')]);
    const proveedor = crearProveedorDeCuentas({
      credenciales: e.repositorio,
      cifrador,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    const cuenta = await proveedor.cuentaPara({ despachoId: DESPACHO.id, procesoId: 'p' }, 'SIUGJ');
    if (!cuenta) throw new Error('sin cuenta');
    const fila = e.porId.get('responsable');

    await cuenta.esperarCodigo();
    expect(fila?.codigoSolicitadoEn).toEqual(AHORA);
    expect(fila?.estado).toBe('REQUIERE_INTERVENCION');

    await cuenta.guardarSesion('{"cookies":[{"name":"PHPSESSID"}]}');
    expect(fila?.codigoSolicitadoEn).toBeNull();
    expect(fila?.estado).toBe('EXITOSA');
    // La sesión nunca se guarda en claro.
    expect(new TextDecoder().decode(fila?.sesionGuardada?.datos)).not.toContain('PHPSESSID');

    await cuenta.registrarRechazo();
    expect(fila?.estado).toBe('CREDENCIALES_INVALIDAS');
    expect(fila?.sesionGuardada).toBeNull();
  });

  it('sin cifrado configurado o sin credenciales no hay cuenta', async () => {
    const vacio = escenario([]);
    const alcance = { despachoId: DESPACHO.id, procesoId: 'p' };
    const sinCredenciales = crearProveedorDeCuentas({
      credenciales: vacio.repositorio,
      cifrador,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    expect(await sinCredenciales.cuentaPara(alcance, 'SIUGJ')).toBeNull();
    const sinCifrado = crearProveedorDeCuentas({
      credenciales: escenario([credencial('x')]).repositorio,
      cifrador: null,
      reloj,
      minutosParaCodigo: MINUTOS,
      logger: silencioso,
    });
    expect(await sinCifrado.cuentaPara(alcance, 'SIUGJ')).toBeNull();
  });
});

describe('leerCodigoDeAcceso', () => {
  it('acepta 4 a 12 letras o cifras, sin espacios', () => {
    expect(leerCodigoDeAcceso(' 246 810 ')).toBe('246810');
    expect(leerCodigoDeAcceso('AB12')).toBe('AB12');
    expect(leerCodigoDeAcceso('12')).toBeNull();
    expect(leerCodigoDeAcceso('1234-5678')).toBeNull();
  });
});

describe('ingresar el código de acceso (web)', () => {
  const pendiente = new Date(AHORA.getTime() - 60_000);

  function montar(filas: Fila[]) {
    const e = escenario(filas);
    const ingresar = crearIngresarCodigoDeAcceso({
      credenciales: e.repositorio,
      cifrador,
      cola: e.cola,
      auditoria: { registrar: async (evento) => void e.eventos.push(evento) },
      reloj,
      minutosParaCodigo: MINUTOS,
    });
    return { ...e, ingresar };
  }

  it('la persona escribe el código de su credencial: viaja cifrado y queda auditado sin el código', async () => {
    const e = montar([credencial('mia', { codigoSolicitadoEn: pendiente })]);
    const r = await e.ingresar(sesion('abogado'), {
      credencialId: 'mia',
      codigo: '246810',
      ip: null,
    });
    expect(r.ok).toBe(true);
    expect(e.codigos).toHaveLength(1);
    expect(new TextDecoder().decode(e.codigos[0]?.codigo.datos)).not.toContain('246810');
    expect(e.eventos[0]).toMatchObject({ accion: 'CODIGO_DE_ACCESO_INGRESADO' });
    expect(JSON.stringify(e.eventos)).not.toContain('246810');
  });

  it('nadie escribe el código de la credencial personal de otra persona', async () => {
    const e = montar([
      credencial('ajena', { codigoSolicitadoEn: pendiente, membresiaId: 'm-otra' }),
    ]);
    const r = await e.ingresar(sesion('abogado'), {
      credencialId: 'ajena',
      codigo: '246810',
      ip: null,
    });
    expect(!r.ok && r.error.codigo).toBe('NO_ENCONTRADO');
    expect(e.codigos).toHaveLength(0);
  });

  it('el de la credencial del despacho lo escribe el administrador, no un abogado', async () => {
    const filas = () => [
      credencial('despacho', {
        alcance: 'DESPACHO',
        membresiaId: 'm-administrador',
        codigoSolicitadoEn: pendiente,
      }),
    ];
    const abogado = montar(filas());
    const r1 = await abogado.ingresar(sesion('abogado'), {
      credencialId: 'despacho',
      codigo: '246810',
      ip: null,
    });
    expect(r1.ok).toBe(false);
    const admin = montar(filas());
    const r2 = await admin.ingresar(sesion('administrador'), {
      credencialId: 'despacho',
      codigo: '246810',
      ip: null,
    });
    expect(r2.ok).toBe(true);
  });

  it('el asistente no gestiona credenciales', async () => {
    const e = montar([
      credencial('mia', { membresiaId: 'm-asistente', codigoSolicitadoEn: pendiente }),
    ]);
    const r = await e.ingresar(sesion('asistente'), {
      credencialId: 'mia',
      codigo: '246810',
      ip: null,
    });
    expect(!r.ok && r.error.codigo).toBe('SIN_PERMISO');
  });

  it('si la plataforma ya no espera un código, o el código no tiene forma de código, lo explica', async () => {
    const sinEspera = montar([credencial('mia')]);
    const r1 = await sinEspera.ingresar(sesion('abogado'), {
      credencialId: 'mia',
      codigo: '246810',
      ip: null,
    });
    expect(!r1.ok && r1.error.mensajeUsuario).toMatch(/ya no está esperando/);

    const malo = montar([credencial('mia', { codigoSolicitadoEn: pendiente })]);
    const r2 = await malo.ingresar(sesion('abogado'), {
      credencialId: 'mia',
      codigo: '12',
      ip: null,
    });
    expect(!r2.ok && r2.error.codigo).toBe('VALIDACION');
  });
});

describe('completar el ingreso con el código (worker)', () => {
  function montar(resultado: Awaited<ReturnType<CompletadorDeIngreso['completar']>>) {
    const e = escenario([credencial('mia', { codigoSolicitadoEn: AHORA })]);
    const recibidos: string[] = [];
    const completador: CompletadorDeIngreso = {
      plataforma: 'SIUGJ',
      async completar(_id, codigo) {
        recibidos.push(codigo);
        return resultado;
      },
    };
    const sincronizacion = {
      procesosActivos: async () => [
        { id: 'laboral', radicado: LABORAL, nunc: null },
        { id: 'civil', radicado: CIVIL, nunc: null },
      ],
    } as unknown as RepositorioDeSincronizacion;
    const completar = crearCompletarIngreso({
      credenciales: e.repositorio,
      cifrador,
      completadores: new Map([['SIUGJ', completador]]),
      sincronizacion,
      automaticas: [
        { codigo: 'SIUGJ', identificador: 'RADICADO', aplica: esDeLaEspecialidadLaboral },
      ],
      cola: e.cola,
      reloj,
      logger: silencioso,
    });
    const codigo = cifrador.cifrar('246810', 'luris-codigo-v1|mia');
    return {
      ...e,
      recibidos,
      ejecutar: () => completar({ despachoId: DESPACHO.id, credencialId: 'mia', codigo }, {}),
    };
  }

  it('con el código correcto guarda la sesión cifrada y reanuda las consultas laborales', async () => {
    const e = montar(ok({ sesion: '{"cookies":[]}' }));
    expect(await e.ejecutar()).toEqual({ ok: true, value: 'INGRESO_COMPLETADO' });
    expect(e.recibidos).toEqual(['246810']);
    const fila = e.porId.get('mia');
    expect(fila?.sesionGuardada).not.toBeNull();
    expect(fila?.codigoSolicitadoEn).toBeNull();
    expect(fila?.estado).toBe('EXITOSA');
    expect(e.sincronizaciones.map((s) => s.procesoId)).toEqual(['laboral']);
  });

  it('un código equivocado deja la credencial esperando otro', async () => {
    const e = montar(err('CODIGO_INVALIDO'));
    expect(await e.ejecutar()).toEqual({ ok: true, value: 'CODIGO_INVALIDO' });
    expect(e.porId.get('mia')?.codigoSolicitadoEn).toEqual(AHORA);
    expect(e.sincronizaciones).toHaveLength(0);
  });

  it('un ingreso vencido libera la credencial para pedir un código nuevo', async () => {
    const e = montar(err('INGRESO_VENCIDO'));
    expect(await e.ejecutar()).toEqual({ ok: true, value: 'INGRESO_VENCIDO' });
    expect(e.porId.get('mia')?.codigoSolicitadoEn).toBeNull();
  });
});
