import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearRepositorioDePendientes } from '@/modules/plataformas/infrastructure/repositorio-de-pendientes-prisma';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  type EscenarioDeDespacho,
} from './apoyo';

/** Bandeja «Pendientes de tu confirmación» (Fase 6) sobre PostgreSQL real. */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let repo: ReturnType<typeof crearRepositorioDePendientes>;

const HACE_UNA_SEMANA = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

async function proceso(
  despachoId: string,
  opciones: { nunc?: boolean; radicado?: boolean; activo?: boolean } = {},
): Promise<string> {
  const creado = await prisma.proceso.create({
    data: {
      despachoId,
      nunc: opciones.nunc === false ? null : digitosAleatorios(21),
      radicado: opciones.radicado ? digitosAleatorios(23) : null,
      activo: opciones.activo ?? true,
    },
  });
  return creado.id;
}

async function abiertos(procesoId: string): Promise<number> {
  return prisma.pendienteDeConfirmacion.count({ where: { procesoId, resueltoEn: null } });
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  repo = crearRepositorioDePendientes((id) => crearClienteDeDespacho(prisma, id));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('abrir pendientes vencidos', () => {
  it('abre uno por proceso activo con NUNC que no se consulta desde hace una semana', async () => {
    const nuevo = await proceso(a.despachoId);
    const archivado = await proceso(a.despachoId, { activo: false });
    const sinNunc = await proceso(a.despachoId, { nunc: false, radicado: true });
    const reciente = await proceso(a.despachoId);
    await prisma.procesoPlataforma.create({
      data: {
        despachoId: a.despachoId,
        procesoId: reciente,
        plataforma: 'SPOA',
        ultimaSincronizacionEn: new Date(),
        estadoUltimaConsulta: 'EXITOSA',
      },
    });
    const viejo = await proceso(a.despachoId);
    await prisma.procesoPlataforma.create({
      data: {
        despachoId: a.despachoId,
        procesoId: viejo,
        plataforma: 'SPOA',
        ultimaSincronizacionEn: new Date('2026-01-01T00:00:00Z'),
        estadoUltimaConsulta: 'EXITOSA',
      },
    });

    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());

    expect(await abiertos(nuevo)).toBe(1);
    expect(await abiertos(viejo)).toBe(1);
    expect(await abiertos(archivado)).toBe(0);
    expect(await abiertos(sinNunc)).toBe(0);
    expect(await abiertos(reciente)).toBe(0);
  });

  it('nunca abre dos para el mismo proceso, aunque se llame otra vez', async () => {
    const id = await proceso(a.despachoId);
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());
    expect(await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA())).toBe(0);
    expect(await abiertos(id)).toBe(1);
    // La base de datos también lo impide (índice único parcial).
    await expect(
      prisma.pendienteDeConfirmacion.create({
        data: { despachoId: a.despachoId, procesoId: id, plataforma: 'SPOA', origen: 'PROGRAMADA' },
      }),
    ).rejects.toThrow();
  });

  it('solo abre en el despacho indicado', async () => {
    const deB = await proceso(b.despachoId);
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());
    expect(await abiertos(deB)).toBe(0);
  });
});

describe('resolver y listar', () => {
  it('resolver lo saca de la bandeja; luego puede abrirse uno nuevo', async () => {
    const id = await proceso(a.despachoId);
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());
    await repo.resolver(a.despachoId, id, 'SPOA', new Date());
    expect(await abiertos(id)).toBe(0);
    expect(await prisma.pendienteDeConfirmacion.count({ where: { procesoId: id } })).toBe(1);

    // Sin una consulta exitosa reciente, vuelve a la bandeja en la siguiente programación.
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());
    expect(await abiertos(id)).toBe(1);
  });

  it('cada persona ve solo los pendientes de procesos que puede ver; nunca los de otro despacho', async () => {
    const asignado = await proceso(a.despachoId);
    await prisma.asignacionProceso.create({
      data: {
        despachoId: a.despachoId,
        procesoId: asignado,
        membresiaId: a.membresiaId,
        tipo: 'ASIGNADO',
      },
    });
    const ajeno = await proceso(a.despachoId);
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());

    const delDespacho = await repo.listar(a.despachoId, { tipo: 'DESPACHO' });
    expect(delDespacho.map((p) => p.procesoId)).toEqual(expect.arrayContaining([asignado, ajeno]));
    expect(delDespacho.every((p) => p.plataforma === 'SPOA')).toBe(true);

    const propios = await repo.listar(a.despachoId, {
      tipo: 'PARTICIPANTE',
      membresiaId: a.membresiaId,
    });
    expect(propios.map((p) => p.procesoId)).toContain(asignado);
    expect(propios.map((p) => p.procesoId)).not.toContain(ajeno);

    const deOtroDespacho = await repo.listar(b.despachoId, { tipo: 'DESPACHO' });
    expect(deOtroDespacho.map((p) => p.procesoId)).not.toContain(asignado);
  });

  it('un proceso archivado sale de la bandeja', async () => {
    const id = await proceso(a.despachoId);
    await repo.abrirVencidos(a.despachoId, 'SPOA', 'NUNC', HACE_UNA_SEMANA());
    await prisma.proceso.update({ where: { id }, data: { activo: false } });
    const lista = await repo.listar(a.despachoId, { tipo: 'DESPACHO' });
    expect(lista.map((p) => p.procesoId)).not.toContain(id);
  });
});
