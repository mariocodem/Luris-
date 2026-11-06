import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  crearClienteDeDespacho,
  ErrorDeAislamiento,
  type ClienteDeDespacho,
} from '@/shared/infrastructure/prisma/aislamiento-despacho';
import { CLASIFICACION } from '@/shared/infrastructure/prisma/modelo-de-datos';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  sufijoUnico,
  type EscenarioDeDespacho,
} from './apoyo';

/**
 * Pruebas obligatorias de aislamiento entre despachos (§4). Dos despachos, A y B, con datos en
 * todas las tablas de negocio y el mismo radicado; un usuario pertenece a ambos.
 */

interface DelegadoGenerico {
  findMany(args?: object): Promise<{ despachoId: string | null }[]>;
  count(args?: object): Promise<number>;
}

function delegado(cliente: object, modelo: string): DelegadoGenerico {
  const clave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
  return (cliente as Record<string, DelegadoGenerico>)[clave] as DelegadoGenerico;
}

const MODELOS_CON_DESPACHO_ID = Object.entries(CLASIFICACION)
  .filter(([, clasificacion]) => clasificacion.startsWith('NEGOCIO'))
  .map(([modelo]) => modelo);

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let clienteA: ClienteDeDespacho;
let usuarioCompartidoId: string;

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  const radicadoCompartido = digitosAleatorios(23);
  a = await crearEscenarioDeDespacho(prisma, { radicado: radicadoCompartido });
  b = await crearEscenarioDeDespacho(prisma, { radicado: radicadoCompartido });

  const compartido = await prisma.usuario.create({
    data: { nombre: 'Persona en dos despachos', email: `compartida-${sufijoUnico()}@pruebas.test` },
  });
  usuarioCompartidoId = compartido.id;
  await prisma.membresia.createMany({
    data: [
      { despachoId: a.despachoId, usuarioId: compartido.id, rol: 'asistente' },
      { despachoId: b.despachoId, usuarioId: compartido.id, rol: 'administrador' },
    ],
  });
  // Registro de plataforma (superadmin), sin despacho.
  await prisma.registroAuditoria.create({ data: { accion: 'DESPACHO_CREADO' } });

  clienteA = crearClienteDeDespacho(prisma, a.despachoId);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cada tabla de negocio', () => {
  it.each(MODELOS_CON_DESPACHO_ID)(
    '%s: el despacho A solo ve sus propias filas',
    async (modelo) => {
      const visibles = await delegado(clienteA, modelo).findMany();
      expect(visibles.length).toBeGreaterThan(0);
      expect(visibles.every((fila) => fila.despachoId === a.despachoId)).toBe(true);

      // B sí tiene filas en esa tabla: la prueba no pasa por falta de datos.
      expect(
        await delegado(prisma, modelo).count({ where: { despachoId: b.despachoId } }),
      ).toBeGreaterThan(0);
      expect(await delegado(clienteA, modelo).count({ where: { despachoId: b.despachoId } })).toBe(
        0,
      );
    },
  );
});

describe('lecturas', () => {
  it('findUnique de un registro de otro despacho devuelve null', async () => {
    expect(await clienteA.proceso.findUnique({ where: { id: b.procesoId } })).toBeNull();
    expect(await clienteA.actuacion.findUnique({ where: { id: b.actuacionId } })).toBeNull();
    expect(
      await clienteA.credencialPlataforma.findUnique({ where: { id: b.credencialId } }),
    ).toBeNull();
  });

  it('pedir explícitamente otro despacho no se "corrige" hacia el propio: devuelve vacío', async () => {
    expect(await clienteA.proceso.findFirst({ where: { despachoId: b.despachoId } })).toBeNull();
    expect(
      await clienteA.proceso.findUnique({
        where: { despachoId_radicado: { despachoId: b.despachoId, radicado: b.radicado } },
      }),
    ).toBeNull();
  });

  it('findUniqueOrThrow de otro despacho falla como "no encontrado"', async () => {
    await expect(
      clienteA.proceso.findUniqueOrThrow({ where: { id: b.procesoId } }),
    ).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('el mismo radicado en dos despachos: cada uno ve solo el suyo', async () => {
    const procesos = await clienteA.proceso.findMany({ where: { radicado: a.radicado } });
    expect(procesos.map((p) => p.id)).toEqual([a.procesoId]);
  });

  it('agregaciones y agrupaciones solo cuentan el propio despacho', async () => {
    const grupos = await clienteA.actuacion.groupBy({ by: ['despachoId'], _count: { _all: true } });
    expect(grupos.map((g) => g.despachoId)).toEqual([a.despachoId]);
    const agregado = await clienteA.consultaMasiva.aggregate({ _sum: { totalItems: true } });
    expect(agregado._sum.totalItems).toBe(1);
  });

  it('las relaciones incluidas desde un registro propio solo traen datos propios', async () => {
    const proceso = await clienteA.proceso.findUniqueOrThrow({
      where: { id: a.procesoId },
      include: { plataformas: { include: { actuaciones: { include: { documentos: true } } } } },
    });
    const documentos = proceso.plataformas.flatMap((p) =>
      p.actuaciones.flatMap((x) => x.documentos),
    );
    expect(documentos.map((d) => d.id)).toEqual([a.documentoId]);
  });

  it('una transacción interactiva conserva el filtro', async () => {
    const ids = await clienteA.$transaction(async (tx) =>
      (await tx.proceso.findMany({ select: { id: true } })).map((p) => p.id),
    );
    expect(ids).not.toContain(b.procesoId);
    expect(ids).toContain(a.procesoId);
  });
});

describe('escrituras', () => {
  // Los tipos de Prisma exigen despachoId; los repositorios lo pasan explícitamente y la extensión
  // verifica que coincida. Estas dos pruebas lo omiten a propósito para comprobar la inyección.
  it('create inyecta el despacho de la sesión', async () => {
    const etiqueta = await clienteA.etiqueta.create({
      data: { nombre: `Nueva ${sufijoUnico()}` } as never,
    });
    expect(etiqueta.despachoId).toBe(a.despachoId);
  });

  it('createMany inyecta el despacho en cada fila', async () => {
    const nombres = [`Lote ${sufijoUnico()}`, `Lote ${sufijoUnico()}`];
    const creadas = await clienteA.etiqueta.createManyAndReturn({
      data: nombres.map((nombre) => ({ nombre })) as never,
    });
    expect(creadas.map((e) => e.despachoId)).toEqual([a.despachoId, a.despachoId]);
  });

  it('crear en otro despacho se rechaza', async () => {
    await expect(
      clienteA.etiqueta.create({ data: { despachoId: b.despachoId, nombre: 'Intrusa' } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
  });

  it('actualizar o borrar un registro de otro despacho falla como "no encontrado" y no lo toca', async () => {
    await expect(
      clienteA.proceso.update({ where: { id: b.procesoId }, data: { alias: 'Modificado por A' } }),
    ).rejects.toMatchObject({ code: 'P2025' });
    await expect(clienteA.documento.delete({ where: { id: b.documentoId } })).rejects.toMatchObject(
      {
        code: 'P2025',
      },
    );

    const procesoB = await prisma.proceso.findUniqueOrThrow({ where: { id: b.procesoId } });
    expect(procesoB.alias).not.toBe('Modificado por A');
    expect(await prisma.documento.count({ where: { id: b.documentoId } })).toBe(1);
  });

  it('updateMany y deleteMany sin filtro solo afectan al propio despacho', async () => {
    const { count } = await clienteA.preferenciaNotificacion.updateMany({
      data: { correoActivo: false },
    });
    expect(count).toBeGreaterThan(0);
    const preferenciaB = await prisma.preferenciaNotificacion.findUniqueOrThrow({
      where: { id: b.preferenciaId },
    });
    expect(preferenciaB.correoActivo).toBe(true);

    const borrados = await clienteA.itemConsultaMasiva.deleteMany({
      where: { despachoId: b.despachoId },
    });
    expect(borrados.count).toBe(0);
  });

  it('mover un registro a otro despacho se rechaza', async () => {
    await expect(
      clienteA.proceso.update({ where: { id: a.procesoId }, data: { despachoId: b.despachoId } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
  });

  it('upsert sobre un registro de otro despacho crea en el propio y no toca el ajeno', async () => {
    const nuevoRadicado = digitosAleatorios(23);
    const resultado = await clienteA.proceso.upsert({
      where: { id: b.procesoId },
      create: { despachoId: a.despachoId, radicado: nuevoRadicado },
      update: { alias: 'Upsert de A' },
    });
    expect(resultado.id).not.toBe(b.procesoId);
    expect(resultado.despachoId).toBe(a.despachoId);
    const procesoB = await prisma.proceso.findUniqueOrThrow({ where: { id: b.procesoId } });
    expect(procesoB.alias).not.toBe('Upsert de A');
  });

  it('las escrituras anidadas se rechazan (incluido "conectar" registros ajenos)', async () => {
    await expect(
      clienteA.proceso.update({
        where: { id: a.procesoId },
        data: { asignaciones: { connect: { id: b.asignacionId } } },
      }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(
      clienteA.proceso.create({
        data: {
          despachoId: a.despachoId,
          radicado: digitosAleatorios(23),
          plataformas: { create: { plataforma: 'SAMAI' } },
        } as never, // mezcla de entradas que Prisma no tipa; aquí importa el rechazo
      }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);

    const asignacionB = await prisma.asignacionProceso.findUniqueOrThrow({
      where: { id: b.asignacionId },
    });
    expect(asignacionB.procesoId).toBe(b.procesoId);
  });

  it('las consultas SQL crudas se rechazan', async () => {
    await expect(clienteA.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(clienteA.$executeRawUnsafe('DELETE FROM procesos')).rejects.toBeInstanceOf(
      ErrorDeAislamiento,
    );
  });
});

describe('la base de datos impide relaciones entre despachos (claves foráneas compuestas)', () => {
  it('una actuación de A no puede colgar de un proceso-plataforma de B, ni siquiera sin la extensión', async () => {
    await expect(
      prisma.actuacion.create({
        data: {
          despachoId: a.despachoId,
          procesoPlataformaId: b.procesoPlataformaId,
          claveDeduplicacion: `cruzada-${sufijoUnico()}`,
          fechaActuacion: new Date('2024-05-01'),
          descripcion: 'Intento cruzado',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('no se puede asignar a un proceso de A una membresía de B', async () => {
    await expect(
      clienteA.asignacionProceso.create({
        data: {
          despachoId: a.despachoId,
          procesoId: a.procesoId,
          membresiaId: b.membresiaId,
          tipo: 'ASIGNADO',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('usuarios (globales)', () => {
  it('el despacho solo ve a sus miembros, incluido quien pertenece a varios despachos', async () => {
    const ids = (await clienteA.usuario.findMany({ select: { id: true } })).map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining([a.usuarioId, usuarioCompartidoId]));
    expect(ids).not.toContain(b.usuarioId);
    expect(await clienteA.usuario.findUnique({ where: { id: b.usuarioId } })).toBeNull();
  });

  it('no puede editar a un usuario de otro despacho', async () => {
    await expect(
      clienteA.usuario.update({ where: { id: b.usuarioId }, data: { nombre: 'Cambio de A' } }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('solo puede editar nombre e imagen (nunca email ni superadmin)', async () => {
    const editado = await clienteA.usuario.update({
      where: { id: a.usuarioId },
      data: { nombre: 'Nombre nuevo' },
    });
    expect(editado.nombre).toBe('Nombre nuevo');
    await expect(
      clienteA.usuario.update({ where: { id: a.usuarioId }, data: { esSuperadmin: true } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(
      clienteA.usuario.update({ where: { id: a.usuarioId }, data: { email: 'otro@pruebas.test' } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
  });

  it('no permite navegar desde un usuario hacia sus membresías en otros despachos', async () => {
    await expect(
      clienteA.membresia.findMany({ include: { usuario: { include: { membresias: true } } } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(
      clienteA.usuario.findMany({ select: { _count: { select: { membresias: true } } } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(
      clienteA.proceso.findMany({
        where: {
          asignaciones: {
            some: {
              membresia: { usuario: { membresias: { some: { despachoId: b.despachoId } } } },
            },
          },
        },
      }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
  });

  it('sí permite ver los datos del usuario desde la membresía del despacho', async () => {
    const membresias = await clienteA.membresia.findMany({ include: { usuario: true } });
    expect(membresias.map((m) => m.usuario.id)).toEqual(
      expect.arrayContaining([a.usuarioId, usuarioCompartidoId]),
    );
    expect(membresias.every((m) => m.despachoId === a.despachoId)).toBe(true);
  });
});

describe('el propio despacho', () => {
  it('solo ve su propia fila', async () => {
    expect((await clienteA.despacho.findMany()).map((d) => d.id)).toEqual([a.despachoId]);
    expect(await clienteA.despacho.findUnique({ where: { id: b.despachoId } })).toBeNull();
  });

  it('puede editar su nombre, pero no su estado ni su plan', async () => {
    const editado = await clienteA.despacho.update({
      where: { id: a.despachoId },
      data: { nombre: 'Renombrado' },
    });
    expect(editado.nombre).toBe('Renombrado');
    await expect(
      clienteA.despacho.update({ where: { id: a.despachoId }, data: { estado: 'ACTIVO' } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(
      clienteA.despacho.update({ where: { id: a.despachoId }, data: { plan: 'PREMIUM' } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
  });

  it('no puede crear ni borrar despachos', async () => {
    await expect(
      clienteA.despacho.create({ data: { nombre: 'Otro', slug: `otro-${sufijoUnico()}` } }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(clienteA.despacho.delete({ where: { id: a.despachoId } })).rejects.toBeInstanceOf(
      ErrorDeAislamiento,
    );
  });
});

describe('auditoría', () => {
  it('solo ve los registros del propio despacho (ni de otros ni de plataforma)', async () => {
    const registros = await clienteA.registroAuditoria.findMany();
    expect(registros.length).toBeGreaterThan(0);
    expect(registros.every((r) => r.despachoId === a.despachoId)).toBe(true);
  });

  it('permite agregar registros, pero nunca editarlos ni borrarlos', async () => {
    const registro = await clienteA.registroAuditoria.create({ data: { accion: 'PRUEBA' } });
    expect(registro.despachoId).toBe(a.despachoId);
    await expect(
      clienteA.registroAuditoria.update({
        where: { id: registro.id },
        data: { accion: 'ALTERADO' },
      }),
    ).rejects.toBeInstanceOf(ErrorDeAislamiento);
    await expect(clienteA.registroAuditoria.deleteMany()).rejects.toBeInstanceOf(
      ErrorDeAislamiento,
    );
  });
});

describe('creación del cliente', () => {
  it('exige un despachoId con formato UUID', () => {
    expect(() => crearClienteDeDespacho(prisma, '')).toThrow(ErrorDeAislamiento);
    expect(() => crearClienteDeDespacho(prisma, "' OR 1=1 --")).toThrow(ErrorDeAislamiento);
  });
});
