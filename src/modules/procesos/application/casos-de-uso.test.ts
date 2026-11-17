import { describe, expect, it } from 'vitest';
import type { EventoDeAuditoria } from '@/modules/auditoria/domain/registro-de-auditoria';
import type {
  ContextoDeSesion,
  ContextoMiembro,
} from '@/modules/usuarios/application/contexto-de-sesion';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { crearNunc, type Nunc } from '@/shared/domain/nunc';
import { crearRadicado, type Radicado } from '@/shared/domain/radicado';
import { err, ok, type Result } from '@/shared/domain/result';
import { ErrorDeImportacion } from '../domain/errores';
import type { Asignacion, DatosDeProceso } from '../domain/proceso';
import type { MiembroAsignable } from '../domain/reglas';
import { crearCambiarEstadoDeProceso } from './archivar-proceso';
import { crearAgregarAsignado, crearAsignarResponsable, crearQuitarAsignado } from './asignaciones';
import { crearConsultarProceso } from './consultar-proceso';
import { crearEditarProceso } from './editar-proceso';
import { crearImportarProcesos, crearPrevisualizarImportacion } from './importar-procesos';
import { crearListarProcesos } from './listar-procesos';
import type {
  AlcanceDeLista,
  DetalleDeProceso,
  LectorDeTablas,
  NuevoProceso,
  RepositorioDeProcesos,
} from './puertos';
import { crearRegistrarProceso } from './registrar-proceso';

/**
 * Casos de uso de procesos (Fase 4) con dobles en memoria: verifican los permisos del §5 en el
 * servidor, las asignaciones automáticas, los duplicados y la auditoría.
 */

const DESPACHO = { id: '00000000-0000-7000-8000-000000000001', nombre: 'Despacho Demo' };

function radicado(texto: string): Radicado {
  const r = crearRadicado(texto);
  if (!r.ok) throw new Error(texto);
  return r.value;
}
function nunc(texto: string): Nunc {
  const r = crearNunc(texto);
  if (!r.ok) throw new Error(texto);
  return r.value;
}

const R1 = radicado('11001310300120230012300');
const R2 = radicado('05001310500220240004500');
const N1 = nunc('110016000049202300123');

function sesion(rol: RolDeDespacho, membresiaId = `m-${rol}`): ContextoMiembro {
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

const MIEMBROS: MiembroAsignable[] = [
  { membresiaId: 'm-administrador', nombre: 'Laura', rol: 'administrador', activa: true },
  { membresiaId: 'm-abogado', nombre: 'Carlos', rol: 'abogado', activa: true },
  { membresiaId: 'm-abogada', nombre: 'Mariana', rol: 'abogado', activa: true },
  { membresiaId: 'm-asistente', nombre: 'Paula', rol: 'asistente', activa: true },
  { membresiaId: 'm-inactivo', nombre: 'Andrés', rol: 'abogado', activa: false },
];

function datos(parciales: Partial<DatosDeProceso> = {}): DatosDeProceso {
  return {
    radicado: R1,
    nunc: null,
    alias: 'Ejecutivo',
    cliente: null,
    etiquetas: [],
    ...parciales,
  };
}

interface ProcesoGuardado extends NuevoProceso {
  readonly id: string;
  activo: boolean;
  asignaciones: Asignacion[];
  totalActuaciones: number;
}

function crearEscenario() {
  const procesos = new Map<string, ProcesoGuardado>();
  const eventos: EventoDeAuditoria[] = [];
  let carrera = false;
  let consultas: AlcanceDeLista[] = [];

  function detalle(p: ProcesoGuardado): DetalleDeProceso {
    return {
      id: p.id,
      radicado: p.radicado,
      nunc: p.nunc,
      alias: p.alias,
      cliente: p.cliente,
      activo: p.activo,
      creadoEn: new Date(),
      etiquetas: p.etiquetas.map((nombre, i) => ({ id: `e-${i}`, nombre })),
      asignaciones: p.asignaciones.map((a) => {
        const m = MIEMBROS.find((x) => x.membresiaId === a.membresiaId);
        return {
          ...a,
          nombre: m?.nombre ?? '?',
          rol: m?.rol ?? 'abogado',
          activa: m?.activa ?? true,
        };
      }),
      plataformas: [],
      actuaciones: [],
      totalActuaciones: p.totalActuaciones,
    };
  }

  const repositorio: RepositorioDeProcesos = {
    listar: async (_d, filtros, alcance) => {
      consultas.push(alcance);
      return { procesos: [], total: 0, pagina: filtros.pagina, porPagina: 50 };
    },
    buscar: async (_d, id) => {
      const p = procesos.get(id);
      return p ? detalle(p) : null;
    },
    buscarPorIdentificadores: async (_d, { radicados, nuncs }) =>
      [...procesos.values()]
        .filter(
          (p) =>
            (p.radicado && radicados.includes(p.radicado)) || (p.nunc && nuncs.includes(p.nunc)),
        )
        .map((p) => ({ id: p.id, radicado: p.radicado, nunc: p.nunc })),
    registrar: async (_d, nuevo): Promise<Result<{ id: string }, 'DUPLICADO'>> => {
      if (carrera) return err('DUPLICADO');
      const id = `p-${procesos.size + 1}`;
      procesos.set(id, {
        ...nuevo,
        id,
        activo: true,
        asignaciones: [...nuevo.asignaciones],
        totalActuaciones: 0,
      });
      return ok({ id });
    },
    registrarVarios: async (_d, nuevos) => {
      for (const nuevo of nuevos) {
        const id = `p-${procesos.size + 1}`;
        procesos.set(id, {
          ...nuevo,
          id,
          activo: true,
          asignaciones: [...nuevo.asignaciones],
          totalActuaciones: 0,
        });
      }
      return nuevos.length;
    },
    actualizar: async (_d, id, cambios) => {
      const p = procesos.get(id);
      if (p) procesos.set(id, { ...p, ...cambios });
      return ok(undefined);
    },
    cambiarActivo: async (_d, id, activo) => {
      const p = procesos.get(id);
      if (p) p.activo = activo;
    },
    establecerResponsable: async (_d, id, membresiaId) => {
      const p = procesos.get(id);
      if (!p) return;
      p.asignaciones = p.asignaciones.filter(
        (a) => a.tipo !== 'RESPONSABLE' && a.membresiaId !== membresiaId,
      );
      if (membresiaId) p.asignaciones.push({ membresiaId, tipo: 'RESPONSABLE' });
    },
    agregarAsignado: async (_d, id, membresiaId) => {
      procesos.get(id)?.asignaciones.push({ membresiaId, tipo: 'ASIGNADO' });
    },
    quitarAsignado: async (_d, id, membresiaId) => {
      const p = procesos.get(id);
      if (p) p.asignaciones = p.asignaciones.filter((a) => a.membresiaId !== membresiaId);
    },
  };

  const deps = {
    procesos: repositorio,
    directorio: {
      miembros: async () => MIEMBROS,
      etiquetas: async () => [],
    },
    auditoria: { registrar: async (evento: EventoDeAuditoria) => void eventos.push(evento) },
  };

  /** Proceso ya guardado con estas asignaciones. */
  function sembrar(asignaciones: Asignacion[], extra: Partial<ProcesoGuardado> = {}): string {
    const id = `p-${procesos.size + 1}`;
    procesos.set(id, { ...datos(), asignaciones, id, activo: true, totalActuaciones: 0, ...extra });
    return id;
  }

  return {
    deps,
    procesos,
    eventos,
    sembrar,
    simularCarrera: () => (carrera = true),
    alcancesConsultados: () => {
      const copia = consultas;
      consultas = [];
      return copia;
    },
  };
}

const NINGUNO = { responsableId: null, asignadosIds: [], ip: null } as const;

describe('listar procesos', () => {
  it('el administrador ve el despacho completo; abogado y asistente, solo lo suyo', async () => {
    const e = crearEscenario();
    const listar = crearListarProcesos(e.deps);
    const filtros = {
      texto: null,
      estado: 'activos',
      etiquetaId: null,
      responsable: null,
      orden: 'recientes',
      pagina: 1,
    } as const;

    const admin = await listar(sesion('administrador'), filtros);
    const abogado = await listar(sesion('abogado'), filtros);
    const asistente = await listar(sesion('asistente'), filtros);

    expect(e.alcancesConsultados()).toEqual([
      { tipo: 'DESPACHO' },
      { tipo: 'PARTICIPANTE', membresiaId: 'm-abogado' },
      { tipo: 'PARTICIPANTE', membresiaId: 'm-asistente' },
    ]);
    expect(admin.ok && admin.value.soloPropios).toBe(false);
    expect(abogado.ok && abogado.value.soloPropios).toBe(true);
    expect(asistente.ok && asistente.value.puedeRegistrar).toBe(true);
  });

  it('el superadmin no ve procesos de los despachos', async () => {
    const e = crearEscenario();
    const resultado = await crearListarProcesos(e.deps)(SUPERADMIN, {
      texto: null,
      estado: 'todos',
      etiquetaId: null,
      responsable: null,
      orden: 'recientes',
      pagina: 1,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('SIN_PERMISO');
    expect(e.alcancesConsultados()).toEqual([]);
  });
});

describe('consultar un proceso', () => {
  it('responde "no encontrado" igual si no existe o si no le corresponde (no revela que existe)', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogada', tipo: 'RESPONSABLE' }]);
    const consultar = crearConsultarProceso(e.deps);

    const ajeno = await consultar(sesion('abogado'), id);
    const inexistente = await consultar(sesion('abogado'), 'p-999');
    expect(!ajeno.ok && ajeno.error.mensajeUsuario).toBe(
      !inexistente.ok && inexistente.error.mensajeUsuario,
    );
    expect(!ajeno.ok && ajeno.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('devuelve los permisos de la persona sobre el proceso', async () => {
    const e = crearEscenario();
    const id = e.sembrar([
      { membresiaId: 'm-abogado', tipo: 'RESPONSABLE' },
      { membresiaId: 'm-asistente', tipo: 'ASIGNADO' },
    ]);
    const consultar = crearConsultarProceso(e.deps);
    const abogado = await consultar(sesion('abogado'), id);
    const asistente = await consultar(sesion('asistente'), id);
    expect(abogado.ok && abogado.value.permisos).toEqual({
      ver: true,
      editar: true,
      cambiarResponsable: false,
      gestionarAsignados: true,
    });
    expect(asistente.ok && asistente.value.permisos.gestionarAsignados).toBe(false);
  });
});

describe('registrar un proceso', () => {
  it('el abogado queda como responsable y el asistente como apoyo', async () => {
    const e = crearEscenario();
    const registrar = crearRegistrarProceso(e.deps);
    const delAbogado = await registrar(sesion('abogado'), { datos: datos(), ...NINGUNO });
    const delAsistente = await registrar(sesion('asistente'), {
      datos: datos({ radicado: R2 }),
      ...NINGUNO,
    });

    expect(e.procesos.get(delAbogado.ok ? delAbogado.value.id : '')?.asignaciones).toEqual([
      { membresiaId: 'm-abogado', tipo: 'RESPONSABLE' },
    ]);
    expect(e.procesos.get(delAsistente.ok ? delAsistente.value.id : '')?.asignaciones).toEqual([
      { membresiaId: 'm-asistente', tipo: 'ASIGNADO' },
    ]);
    expect(e.eventos.map((ev) => [ev.accion, ev.datos])).toEqual([
      ['PROCESO_REGISTRADO', { radicado: R1, nunc: null }],
      ['PROCESO_REGISTRADO', { radicado: R2, nunc: null }],
    ]);
  });

  it('el administrador elige responsable y apoyo; no queda asignado él mismo', async () => {
    const e = crearEscenario();
    const resultado = await crearRegistrarProceso(e.deps)(sesion('administrador'), {
      datos: datos(),
      responsableId: 'm-abogada',
      asignadosIds: ['m-asistente', 'm-abogada'],
      ip: null,
    });
    expect(e.procesos.get(resultado.ok ? resultado.value.id : '')?.asignaciones).toEqual([
      { membresiaId: 'm-abogada', tipo: 'RESPONSABLE' },
      { membresiaId: 'm-asistente', tipo: 'ASIGNADO' },
    ]);
  });

  it.each([
    ['un asistente como responsable', 'm-asistente', [], /asígnalo como apoyo/],
    ['una cuenta desactivada como responsable', 'm-inactivo', [], /desactivada/],
    ['una cuenta desactivada como apoyo', null, ['m-inactivo'], /desactivada/],
    ['alguien de otro despacho', 'm-ajeno', [], /No encontramos a esa persona/],
  ])('rechaza %s', async (_caso, responsableId, asignadosIds, mensaje) => {
    const e = crearEscenario();
    const resultado = await crearRegistrarProceso(e.deps)(sesion('administrador'), {
      datos: datos(),
      responsableId,
      asignadosIds,
      ip: null,
    });
    expect(!resultado.ok && resultado.error.mensajeUsuario).toMatch(mensaje);
    expect(e.procesos.size).toBe(0);
  });

  it('solo el administrador puede elegir asignaciones al registrar', async () => {
    const e = crearEscenario();
    const resultado = await crearRegistrarProceso(e.deps)(sesion('abogado'), {
      datos: datos(),
      responsableId: 'm-abogada',
      asignadosIds: [],
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('SIN_PERMISO');
    expect(e.procesos.size).toBe(0);
  });

  it('rechaza un radicado o NUNC ya registrado en el despacho, con el número', async () => {
    const e = crearEscenario();
    e.sembrar([], { radicado: R1, nunc: N1 });
    const registrar = crearRegistrarProceso(e.deps);
    const porRadicado = await registrar(sesion('administrador'), { datos: datos(), ...NINGUNO });
    const porNunc = await registrar(sesion('administrador'), {
      datos: datos({ radicado: null, nunc: N1 }),
      ...NINGUNO,
    });
    expect(!porRadicado.ok && porRadicado.error.mensajeUsuario).toMatch(`radicado ${R1}`);
    expect(!porNunc.ok && porNunc.error.mensajeUsuario).toMatch(`NUNC ${N1}`);
  });

  it('si otra persona lo registra al mismo tiempo, responde como duplicado', async () => {
    const e = crearEscenario();
    e.simularCarrera();
    const resultado = await crearRegistrarProceso(e.deps)(sesion('abogado'), {
      datos: datos(),
      ...NINGUNO,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('PROCESO_DUPLICADO');
    expect(e.eventos).toEqual([]);
  });

  it('el superadmin no registra procesos', async () => {
    const e = crearEscenario();
    const resultado = await crearRegistrarProceso(e.deps)(SUPERADMIN, {
      datos: datos(),
      ...NINGUNO,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('editar un proceso', () => {
  it('sin cambios no escribe ni audita', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }]);
    const resultado = await crearEditarProceso(e.deps)(sesion('abogado'), {
      procesoId: id,
      datos: datos(),
      ip: null,
    });
    expect(resultado.ok).toBe(true);
    expect(e.eventos).toEqual([]);
  });

  it('audita los campos cambiados', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-asistente', tipo: 'ASIGNADO' }]);
    await crearEditarProceso(e.deps)(sesion('asistente'), {
      procesoId: id,
      datos: datos({ alias: 'Nuevo alias', etiquetas: ['Civil'] }),
      ip: null,
    });
    expect(e.procesos.get(id)?.alias).toBe('Nuevo alias');
    expect(e.eventos[0]?.datos).toEqual({ campos: 'alias,etiquetas' });
  });

  it('no permite cambiar el radicado si ya hay actuaciones', async () => {
    const e = crearEscenario();
    const id = e.sembrar([], { totalActuaciones: 3 });
    const resultado = await crearEditarProceso(e.deps)(sesion('administrador'), {
      procesoId: id,
      datos: datos({ radicado: R2 }),
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('IDENTIFICADOR_BLOQUEADO');
    expect(e.procesos.get(id)?.radicado).toBe(R1);
  });

  it('permite corregir el radicado sin actuaciones, salvo que lo use otro proceso', async () => {
    const e = crearEscenario();
    const id = e.sembrar([]);
    e.sembrar([], { radicado: R2 });
    const editar = crearEditarProceso(e.deps);
    const duplicado = await editar(sesion('administrador'), {
      procesoId: id,
      datos: datos({ radicado: R2 }),
      ip: null,
    });
    expect(!duplicado.ok && duplicado.error.codigo).toBe('PROCESO_DUPLICADO');
    const corregido = await editar(sesion('administrador'), {
      procesoId: id,
      datos: datos({ radicado: radicado('11001310300120230099900') }),
      ip: null,
    });
    expect(corregido.ok).toBe(true);
  });

  it('un abogado no edita procesos ajenos (ni sabe que existen)', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogada', tipo: 'RESPONSABLE' }]);
    const resultado = await crearEditarProceso(e.deps)(sesion('abogado'), {
      procesoId: id,
      datos: datos({ alias: 'Intento' }),
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('archivar y restaurar', () => {
  it('cambia el estado y lo audita; repetir no hace nada', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }]);
    const cambiar = crearCambiarEstadoDeProceso(e.deps);
    await cambiar(sesion('abogado'), { procesoId: id, activo: false, ip: null });
    await cambiar(sesion('abogado'), { procesoId: id, activo: false, ip: null });
    await cambiar(sesion('abogado'), { procesoId: id, activo: true, ip: null });
    expect(e.procesos.get(id)?.activo).toBe(true);
    expect(e.eventos.map((ev) => ev.accion)).toEqual(['PROCESO_ARCHIVADO', 'PROCESO_RESTAURADO']);
  });
});

describe('asignaciones', () => {
  it('el administrador cambia el responsable; quien era apoyo pasa a responsable', async () => {
    const e = crearEscenario();
    const id = e.sembrar([
      { membresiaId: 'm-abogado', tipo: 'RESPONSABLE' },
      { membresiaId: 'm-abogada', tipo: 'ASIGNADO' },
    ]);
    const resultado = await crearAsignarResponsable(e.deps)(sesion('administrador'), {
      procesoId: id,
      membresiaId: 'm-abogada',
      ip: null,
    });
    expect(resultado.ok).toBe(true);
    expect(e.procesos.get(id)?.asignaciones).toEqual([
      { membresiaId: 'm-abogada', tipo: 'RESPONSABLE' },
    ]);
    expect(e.eventos[0]?.datos).toEqual({
      responsableAnterior: 'm-abogado',
      responsableNuevo: 'm-abogada',
    });
  });

  it('el abogado responsable no puede cambiar el responsable', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }]);
    const resultado = await crearAsignarResponsable(e.deps)(sesion('abogado'), {
      procesoId: id,
      membresiaId: 'm-abogada',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.mensajeUsuario).toMatch(/Solo el administrador/);
  });

  it('el abogado responsable suma y quita apoyo en su proceso', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }]);
    const agregar = crearAgregarAsignado(e.deps);
    expect(
      (await agregar(sesion('abogado'), { procesoId: id, membresiaId: 'm-asistente', ip: null }))
        .ok,
    ).toBe(true);
    const repetido = await agregar(sesion('abogado'), {
      procesoId: id,
      membresiaId: 'm-asistente',
      ip: null,
    });
    expect(!repetido.ok && repetido.error.mensajeUsuario).toBe('Paula ya sigue este proceso.');
    expect(
      (
        await crearQuitarAsignado(e.deps)(sesion('abogado'), {
          procesoId: id,
          membresiaId: 'm-asistente',
          ip: null,
        })
      ).ok,
    ).toBe(true);
    expect(e.eventos.map((ev) => ev.accion)).toEqual([
      'PROCESO_ASIGNACION_AGREGADA',
      'PROCESO_ASIGNACION_QUITADA',
    ]);
  });

  it('el asistente asignado no reparte trabajo', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-asistente', tipo: 'ASIGNADO' }]);
    const resultado = await crearAgregarAsignado(e.deps)(sesion('asistente'), {
      procesoId: id,
      membresiaId: 'm-abogada',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.codigo).toBe('SIN_PERMISO');
  });

  it('al responsable no se le quita como apoyo', async () => {
    const e = crearEscenario();
    const id = e.sembrar([{ membresiaId: 'm-abogado', tipo: 'RESPONSABLE' }]);
    const resultado = await crearQuitarAsignado(e.deps)(sesion('administrador'), {
      procesoId: id,
      membresiaId: 'm-abogado',
      ip: null,
    });
    expect(!resultado.ok && resultado.error.mensajeUsuario).toMatch(/elegir otro responsable/);
  });
});

describe('importación', () => {
  const lector = (filas: string[][]): LectorDeTablas => ({ leer: async () => ok(filas) });
  const ARCHIVO = { nombre: 'procesos.csv', tipo: 'text/csv', contenido: new Uint8Array() };

  it('la vista previa separa nuevos, ya registrados, errores y duplicados', async () => {
    const e = crearEscenario();
    e.sembrar([], { radicado: R2 });
    const previsualizar = crearPrevisualizarImportacion({
      procesos: e.deps.procesos,
      lector: lector([['Radicado'], [R1], [R2], [R1], ['123']]),
    });
    const resultado = await previsualizar(sesion('abogado'), ARCHIVO);
    if (!resultado.ok) throw resultado.error;
    expect(resultado.value.nuevos.map((p) => p.radicado)).toEqual([R1]);
    expect(resultado.value.yaRegistrados.map((p) => p.radicado)).toEqual([R2]);
    expect(resultado.value.duplicados).toHaveLength(1);
    expect(resultado.value.errores).toHaveLength(1);
    expect(e.procesos.size).toBe(1);
  });

  it('pasa el error del lector tal cual (mensaje para la persona)', async () => {
    const e = crearEscenario();
    const resultado = await crearPrevisualizarImportacion({
      procesos: e.deps.procesos,
      lector: {
        leer: async () => err(new ErrorDeImportacion('Guarda el archivo como .xlsx o .csv.')),
      },
    })(sesion('abogado'), ARCHIVO);
    expect(!resultado.ok && resultado.error.mensajeUsuario).toBe(
      'Guarda el archivo como .xlsx o .csv.',
    );
  });

  it('importa solo lo nuevo, sin repetidos, y asigna a quien importa', async () => {
    const e = crearEscenario();
    e.sembrar([], { radicado: R2 });
    const resultado = await crearImportarProcesos(e.deps)(sesion('abogado'), {
      procesos: [datos(), datos(), datos({ radicado: R2 }), datos({ radicado: null, nunc: N1 })],
      ip: null,
    });
    expect(resultado).toEqual({ ok: true, value: { creados: 2, omitidos: 2 } });
    const nuevos = [...e.procesos.values()].filter((p) => p.radicado !== R2);
    expect(nuevos.every((p) => p.asignaciones[0]?.membresiaId === 'm-abogado')).toBe(true);
    expect(e.eventos[0]).toMatchObject({
      accion: 'PROCESOS_IMPORTADOS',
      datos: { creados: 2, omitidos: 2 },
    });
  });

  it('rechaza una importación vacía o de más de 1000 procesos', async () => {
    const e = crearEscenario();
    const importar = crearImportarProcesos(e.deps);
    const vacia = await importar(sesion('abogado'), { procesos: [], ip: null });
    const enorme = await importar(sesion('abogado'), {
      procesos: Array.from({ length: 1001 }, () => datos()),
      ip: null,
    });
    expect(!vacia.ok && vacia.error.codigo).toBe('IMPORTACION_INVALIDA');
    expect(!enorme.ok && enorme.error.mensajeUsuario).toMatch(/máximo 1000/);
  });
});
