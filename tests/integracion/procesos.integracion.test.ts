import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import type { FiltrosDeProcesos, NuevoProceso } from '@/modules/procesos/application/puertos';
import {
  crearDirectorioDelDespacho,
  crearRepositorioDeProcesos,
} from '@/modules/procesos/infrastructure/repositorio-de-procesos-prisma';
import type { Nunc } from '@/shared/domain/nunc';
import type { Radicado } from '@/shared/domain/radicado';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  sufijoUnico,
  type EscenarioDeDespacho,
} from './apoyo';

/** Repositorio de procesos sobre PostgreSQL real, siempre a través del cliente aislado. */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let repo: ReturnType<typeof crearRepositorioDeProcesos>;
let abogadaId: string;
let asistenteId: string;

const radicado = () => digitosAleatorios(23) as Radicado;
const nunc = () => digitosAleatorios(21) as Nunc;

function nuevo(parciales: Partial<NuevoProceso> = {}): NuevoProceso {
  return {
    radicado: radicado(),
    nunc: null,
    alias: null,
    cliente: null,
    etiquetas: [],
    asignaciones: [],
    ...parciales,
  };
}

const SIN_FILTROS: FiltrosDeProcesos = {
  texto: null,
  estado: 'todos',
  etiquetaId: null,
  responsable: null,
  orden: 'recientes',
  pagina: 1,
};

async function miembro(despachoId: string, rol: string): Promise<string> {
  const sufijo = sufijoUnico();
  const usuario = await prisma.usuario.create({
    data: { nombre: `Persona ${sufijo}`, email: `persona-${sufijo}@pruebas.test` },
  });
  const membresia = await prisma.membresia.create({
    data: { despachoId, usuarioId: usuario.id, rol },
  });
  return membresia.id;
}

async function registrar(despachoId: string, datos: NuevoProceso): Promise<string> {
  const resultado = await repo.registrar(despachoId, datos);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value.id;
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  repo = crearRepositorioDeProcesos((id) => crearClienteDeDespacho(prisma, id));
  abogadaId = await miembro(a.despachoId, 'abogado');
  asistenteId = await miembro(a.despachoId, 'asistente');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('registrar y consultar', () => {
  it('guarda etiquetas (reutiliza las existentes sin importar mayúsculas) y asignaciones', async () => {
    const id = await registrar(
      a.despachoId,
      nuevo({
        alias: 'Restitución de inmueble',
        cliente: 'José Pérez',
        etiquetas: ['civil', 'Tutela'],
        asignaciones: [
          { membresiaId: abogadaId, tipo: 'RESPONSABLE' },
          { membresiaId: asistenteId, tipo: 'ASIGNADO' },
        ],
      }),
    );
    const detalle = await repo.buscar(a.despachoId, id);
    expect(detalle?.etiquetas.map((e) => e.nombre)).toEqual(['Civil', 'Tutela']);
    expect(detalle?.etiquetas[0]?.id).toBe(a.etiquetaId); // «civil» reutilizó «Civil»
    expect(detalle?.asignaciones.map((x) => [x.membresiaId, x.tipo])).toEqual([
      [abogadaId, 'RESPONSABLE'],
      [asistenteId, 'ASIGNADO'],
    ]);
    expect(detalle?.totalActuaciones).toBe(0);
  });

  it('la ficha trae las actuaciones con sus fechas oficiales, la más reciente primero', async () => {
    const detalle = await repo.buscar(a.despachoId, a.procesoId);
    expect(
      detalle?.actuaciones.map((x) => [x.plataforma, x.fechaActuacion.toISOString().slice(0, 10)]),
    ).toEqual([['RAMA_CPNU', '2024-03-01']]);
    expect(detalle?.plataformas.map((p) => p.plataforma)).toEqual(['RAMA_CPNU']);
  });

  it('rechaza un radicado repetido en el despacho, pero no en otro despacho', async () => {
    expect(await repo.registrar(a.despachoId, nuevo({ radicado: a.radicado as Radicado }))).toEqual(
      {
        ok: false,
        error: 'DUPLICADO',
      },
    );
    expect(
      (await repo.registrar(b.despachoId, nuevo({ radicado: a.radicado as Radicado }))).ok,
    ).toBe(true);
  });

  it('no encuentra procesos de otro despacho ni con identificadores mal formados', async () => {
    expect(await repo.buscar(b.despachoId, a.procesoId)).toBeNull();
    expect(await repo.buscar(a.despachoId, 'no-es-un-uuid')).toBeNull();
    expect(
      await repo.buscarPorIdentificadores(b.despachoId, { radicados: [a.radicado], nuncs: [] }),
    ).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: a.procesoId })]));
  });
});

describe('listar con búsqueda y filtros', () => {
  let despachoId: string;
  let responsableId: string;
  const ids: Record<string, string> = {};
  const R = radicado();

  beforeAll(async () => {
    const otro = await crearEscenarioDeDespacho(prisma);
    despachoId = otro.despachoId;
    responsableId = otro.membresiaId;
    ids.perez = await registrar(
      despachoId,
      nuevo({ alias: 'Ordinario laboral', cliente: 'María Pérez', etiquetas: ['Laboral'] }),
    );
    ids.radicado = await registrar(despachoId, nuevo({ radicado: R, alias: 'Ejecutivo' }));
    ids.nunc = await registrar(
      despachoId,
      nuevo({ radicado: null, nunc: nunc(), alias: 'Denuncia' }),
    );
    ids.archivado = await registrar(despachoId, nuevo({ alias: 'Viejo' }));
    await repo.cambiarActivo(despachoId, ids.archivado, false);
    await repo.establecerResponsable(despachoId, ids.radicado, responsableId);
  });

  const listar = async (filtros: Partial<FiltrosDeProcesos>) =>
    (
      await repo.listar(despachoId, { ...SIN_FILTROS, ...filtros }, { tipo: 'DESPACHO' })
    ).procesos.map((p) => p.id);

  it('busca sin importar tildes ni mayúsculas, en alias y cliente', async () => {
    expect(await listar({ texto: 'perez' })).toEqual([ids.perez]);
    expect(await listar({ texto: 'MARÍA' })).toEqual([ids.perez]);
  });

  it('busca un fragmento del radicado escrito con guiones', async () => {
    const fragmento = `${R.slice(0, 5)}-${R.slice(5, 9)}`;
    expect(await listar({ texto: fragmento })).toContain(ids.radicado);
  });

  it('filtra por estado, etiqueta y responsable', async () => {
    expect(await listar({ estado: 'archivados' })).toEqual([ids.archivado]);
    expect(await listar({ estado: 'activos' })).not.toContain(ids.archivado);
    const laboral = (
      await prisma.etiqueta.findFirstOrThrow({ where: { despachoId, nombre: 'Laboral' } })
    ).id;
    expect(await listar({ etiquetaId: laboral })).toEqual([ids.perez]);
    expect(await listar({ responsable: responsableId })).toContain(ids.radicado);
    expect(await listar({ responsable: 'ninguno' })).not.toContain(ids.radicado);
  });

  it('ordena por alias y trae responsable, etiquetas y última actuación', async () => {
    const pagina = await repo.listar(
      despachoId,
      { ...SIN_FILTROS, orden: 'alias', estado: 'activos' },
      { tipo: 'DESPACHO' },
    );
    const aliases = pagina.procesos.map((p) => p.alias);
    expect(aliases).toEqual([...aliases].sort((x, y) => (x ?? '').localeCompare(y ?? '', 'es')));
    const ejecutivo = pagina.procesos.find((p) => p.id === ids.radicado);
    expect(ejecutivo?.responsable?.membresiaId).toBe(responsableId);
    const conActuacion = pagina.procesos.find((p) => p.ultimaActuacion !== null);
    expect(conActuacion?.ultimaActuacion?.toISOString().slice(0, 10)).toBe('2024-03-01');
  });

  it('el alcance de participante solo trae los procesos asignados a la persona', async () => {
    const propios = await repo.listar(despachoId, SIN_FILTROS, {
      tipo: 'PARTICIPANTE',
      membresiaId: responsableId,
    });
    expect(propios.procesos.map((p) => p.id)).toContain(ids.radicado);
    expect(propios.procesos.map((p) => p.id)).not.toContain(ids.perez);
  });

  it('pagina de 50 en 50 y cuenta el total', async () => {
    const pagina = await repo.listar(despachoId, SIN_FILTROS, { tipo: 'DESPACHO' });
    expect(pagina.porPagina).toBe(50);
    expect(pagina.total).toBe(pagina.procesos.length);
    const vacia = await repo.listar(
      despachoId,
      { ...SIN_FILTROS, pagina: 99 },
      { tipo: 'DESPACHO' },
    );
    expect(vacia.procesos).toEqual([]);
    expect(vacia.total).toBe(pagina.total);
  });
});

describe('editar', () => {
  it('reemplaza las etiquetas y recalcula la búsqueda', async () => {
    const id = await registrar(
      a.despachoId,
      nuevo({ alias: 'Antes', etiquetas: ['Civil', 'Urgente'] }),
    );
    const actual = await repo.buscar(a.despachoId, id);
    if (!actual) throw new Error('falta');
    await repo.actualizar(
      a.despachoId,
      id,
      {
        ...actual,
        radicado: actual.radicado as Radicado,
        nunc: null,
        alias: 'Después Ñandú',
        etiquetas: ['urgente', 'Nueva'],
      },
      { cambiaronIdentificadores: false },
    );
    const editado = await repo.buscar(a.despachoId, id);
    expect(editado?.etiquetas.map((e) => e.nombre)).toEqual(['Nueva', 'Urgente']);
    const fila = await prisma.proceso.findUniqueOrThrow({ where: { id } });
    expect(fila.busqueda).toBe('despues nandu');
  });

  it('al cambiar el identificador descarta los registros de plataforma anteriores', async () => {
    const id = await registrar(a.despachoId, nuevo());
    await prisma.procesoPlataforma.create({
      data: { despachoId: a.despachoId, procesoId: id, plataforma: 'SAMAI' },
    });
    await repo.actualizar(
      a.despachoId,
      id,
      { radicado: radicado(), nunc: null, alias: null, cliente: null, etiquetas: [] },
      { cambiaronIdentificadores: true },
    );
    expect(await prisma.procesoPlataforma.count({ where: { procesoId: id } })).toBe(0);
  });

  it('informa el duplicado si el nuevo radicado ya existe', async () => {
    const id = await registrar(a.despachoId, nuevo());
    const resultado = await repo.actualizar(
      a.despachoId,
      id,
      { radicado: a.radicado as Radicado, nunc: null, alias: null, cliente: null, etiquetas: [] },
      { cambiaronIdentificadores: true },
    );
    expect(resultado).toEqual({ ok: false, error: 'DUPLICADO' });
  });
});

describe('asignaciones', () => {
  it('cambiar el responsable deja uno solo; quien era apoyo pasa a responsable', async () => {
    const id = await registrar(
      a.despachoId,
      nuevo({
        asignaciones: [
          { membresiaId: abogadaId, tipo: 'RESPONSABLE' },
          { membresiaId: a.membresiaId, tipo: 'ASIGNADO' },
        ],
      }),
    );
    await repo.establecerResponsable(a.despachoId, id, a.membresiaId);
    expect(
      (await repo.buscar(a.despachoId, id))?.asignaciones.map((x) => [x.membresiaId, x.tipo]),
    ).toEqual([[a.membresiaId, 'RESPONSABLE']]);
    await repo.establecerResponsable(a.despachoId, id, null);
    expect((await repo.buscar(a.despachoId, id))?.asignaciones).toEqual([]);
  });

  it('agrega y quita apoyo; quitar no toca al responsable', async () => {
    const id = await registrar(
      a.despachoId,
      nuevo({ asignaciones: [{ membresiaId: abogadaId, tipo: 'RESPONSABLE' }] }),
    );
    await repo.agregarAsignado(a.despachoId, id, asistenteId);
    await repo.agregarAsignado(a.despachoId, id, asistenteId); // idempotente
    await repo.quitarAsignado(a.despachoId, id, abogadaId); // es responsable: no se quita
    expect((await repo.buscar(a.despachoId, id))?.asignaciones.map((x) => x.tipo)).toEqual([
      'RESPONSABLE',
      'ASIGNADO',
    ]);
    await repo.quitarAsignado(a.despachoId, id, asistenteId);
    expect((await repo.buscar(a.despachoId, id))?.asignaciones.map((x) => x.tipo)).toEqual([
      'RESPONSABLE',
    ]);
  });

  it('la base rechaza asignar a alguien de otro despacho', async () => {
    const id = await registrar(a.despachoId, nuevo());
    await expect(repo.agregarAsignado(a.despachoId, id, b.membresiaId)).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});

describe('importar en lote', () => {
  it('crea los nuevos, omite los existentes y une etiquetas escritas distinto', async () => {
    const despacho = await crearEscenarioDeDespacho(prisma);
    const R1 = radicado();
    const creados = await repo.registrarVarios(despacho.despachoId, [
      nuevo({
        radicado: R1,
        etiquetas: ['Civil', 'URGENTE'],
        asignaciones: [{ membresiaId: despacho.membresiaId, tipo: 'RESPONSABLE' }],
      }),
      nuevo({ radicado: null, nunc: nunc(), etiquetas: ['civil', 'Urgente'] }),
      nuevo({ radicado: despacho.radicado as Radicado, etiquetas: ['Repetido'] }),
    ]);
    expect(creados).toBe(2);
    const filas = await repo.listar(despacho.despachoId, SIN_FILTROS, { tipo: 'DESPACHO' });
    const importados = filas.procesos.filter((p) => p.id !== despacho.procesoId);
    expect(importados.map((p) => [...p.etiquetas].sort())).toEqual([
      ['Civil', 'URGENTE'],
      ['Civil', 'URGENTE'],
    ]);
    expect(importados.find((p) => p.radicado === R1)?.responsable?.membresiaId).toBe(
      despacho.membresiaId,
    );
    expect(await prisma.etiqueta.count({ where: { despachoId: despacho.despachoId } })).toBe(2);
  });
});

describe('directorio del despacho', () => {
  it('lista solo las personas y etiquetas del propio despacho', async () => {
    const directorio = crearDirectorioDelDespacho((id) => crearClienteDeDespacho(prisma, id));
    const miembros = await directorio.miembros(a.despachoId);
    expect(miembros.map((m) => m.membresiaId)).toEqual(
      expect.arrayContaining([abogadaId, asistenteId, a.membresiaId]),
    );
    expect(miembros.map((m) => m.membresiaId)).not.toContain(b.membresiaId);
    expect((await directorio.etiquetas(b.despachoId)).map((e) => e.id)).not.toContain(a.etiquetaId);
  });
});
