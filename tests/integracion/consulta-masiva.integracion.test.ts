import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import type { ItemNuevoDeConsultaMasiva } from '@/modules/plataformas/application/puertos';
import { resultadoDeSincronizacion } from '@/modules/plataformas/domain/consulta-masiva';
import { crearRepositorioDeConsultasMasivas } from '@/modules/plataformas/infrastructure/repositorio-de-consultas-masivas-prisma';
import { crearRepositorioDePendientes } from '@/modules/plataformas/infrastructure/repositorio-de-pendientes-prisma';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  type EscenarioDeDespacho,
} from './apoyo';

/** Consulta masiva (Fase 10) sobre PostgreSQL real. */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let repo: ReturnType<typeof crearRepositorioDeConsultasMasivas>;

const AHORA = new Date('2026-11-18T15:00:00Z');
const EXITO = resultadoDeSincronizacion('RAMA_CPNU', {
  tipo: 'SINCRONIZADO',
  nuevas: 2,
  total: 10,
  cargaInicial: false,
  reservado: false,
});
const NO_ENCONTRADO = resultadoDeSincronizacion('RAMA_CPNU', {
  tipo: 'FALLIDO',
  codigo: 'NO_ENCONTRADO',
});

async function procesos(despachoId: string, cantidad: number) {
  const creados: { id: string; radicado: string }[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const radicado = digitosAleatorios(23);
    const p = await prisma.proceso.create({ data: { despachoId, radicado } });
    creados.push({ id: p.id, radicado });
  }
  return creados;
}

function itemsDe(
  lista: readonly { id: string; radicado: string }[],
  plataforma: 'RAMA_CPNU' | 'SAMAI' = 'RAMA_CPNU',
): ItemNuevoDeConsultaMasiva[] {
  return lista.map((p) => ({
    tipo: 'RADICADO',
    identificador: p.radicado,
    procesoId: p.id,
    plataforma,
    estado: 'PENDIENTE',
  }));
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  repo = crearRepositorioDeConsultasMasivas((id) => crearClienteDeDespacho(prisma, id));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('lotes e ítems', () => {
  it('crea el lote con sus ítems, lo encuentra y lo cuenta', async () => {
    const lista = await procesos(a.despachoId, 3);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 3,
      items: itemsDe(lista),
    });

    const lote = await repo.buscar(a.despachoId, id);
    expect(lote).toMatchObject({
      estado: 'EN_PROCESO',
      totalProcesos: 3,
      creadaPorId: a.membresiaId,
    });
    expect(lote?.creadaPorNombre).toContain('Abogada');
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ total: 3, pendientes: 3 });
    const items = await repo.items(a.despachoId, id);
    expect(items).toHaveLength(3);
    expect(items[0]?.identificador).toMatch(/^\d{23}$/);
  });

  it('un lote solo con ítems asistidos nace completado (nada que consulte el worker)', async () => {
    const [p] = await procesos(a.despachoId, 1);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: [
        {
          tipo: 'NUNC',
          identificador: digitosAleatorios(21),
          procesoId: p!.id,
          plataforma: 'SPOA',
          estado: 'PENDIENTE_CONFIRMACION',
        },
      ],
    });
    expect(await repo.buscar(a.despachoId, id)).toMatchObject({ estado: 'COMPLETADA' });
  });

  it('el lote se completa cuando el último ítem termina, no antes', async () => {
    const lista = await procesos(a.despachoId, 2);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 2,
      items: itemsDe(lista),
    });

    const primero = await repo.registrarResultado(a.despachoId, {
      procesoId: lista[0]!.id,
      plataforma: 'RAMA_CPNU',
      resultado: EXITO,
      ahora: AHORA,
    });
    expect(primero).toBe(1);
    expect((await repo.buscar(a.despachoId, id))?.estado).toBe('EN_PROCESO');

    await repo.registrarResultado(a.despachoId, {
      procesoId: lista[1]!.id,
      plataforma: 'RAMA_CPNU',
      resultado: NO_ENCONTRADO,
      ahora: AHORA,
    });
    const lote = await repo.buscar(a.despachoId, id);
    expect(lote).toMatchObject({ estado: 'COMPLETADA' });
    expect(lote?.finalizadaEn).toEqual(AHORA);
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ completados: 1, fallidos: 1 });

    const items = await repo.items(a.despachoId, id);
    const exitoso = items.find((i) => i.procesoId === lista[0]!.id);
    expect(exitoso).toMatchObject({ estado: 'COMPLETADO', resultado: 'EXITOSA' });
    expect(exitoso?.resumen).toMatchObject({ nuevas: 2, total: 10 });
    const fallido = items.find((i) => i.procesoId === lista[1]!.id);
    expect(fallido).toMatchObject({ estado: 'FALLIDO', resultado: 'NO_ENCONTRADO' });
    expect(fallido?.resumen?.mensaje).not.toMatch(/NO_ENCONTRADO|404/);
  });

  it('un reintento pasajero deja el ítem en curso y no cierra el lote', async () => {
    const [p] = await procesos(a.despachoId, 1);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: itemsDe([p!]),
    });
    await repo.registrarResultado(a.despachoId, {
      procesoId: p!.id,
      plataforma: 'RAMA_CPNU',
      resultado: {
        estado: 'EN_PROCESO',
        resultado: null,
        resumen: {
          mensaje: 'La plataforma no responde; se reintentará.',
          nuevas: null,
          total: null,
        },
      },
      ahora: AHORA,
    });
    expect((await repo.buscar(a.despachoId, id))?.estado).toBe('EN_PROCESO');
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ enProceso: 1 });
    // Una consulta posterior (el reintento) todavía puede completarlo.
    await repo.registrarResultado(a.despachoId, {
      procesoId: p!.id,
      plataforma: 'RAMA_CPNU',
      resultado: EXITO,
      ahora: AHORA,
    });
    expect((await repo.buscar(a.despachoId, id))?.estado).toBe('COMPLETADA');
  });

  it('una misma consulta sirve a los ítems de todos los lotes que la esperaban', async () => {
    const [p] = await procesos(a.despachoId, 1);
    const l1 = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: itemsDe([p!]),
    });
    const l2 = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: itemsDe([p!]),
    });
    const actualizados = await repo.registrarResultado(a.despachoId, {
      procesoId: p!.id,
      plataforma: 'RAMA_CPNU',
      resultado: EXITO,
      ahora: AHORA,
    });
    expect(actualizados).toBe(2);
    expect((await repo.buscar(a.despachoId, l1.id))?.estado).toBe('COMPLETADA');
    expect((await repo.buscar(a.despachoId, l2.id))?.estado).toBe('COMPLETADA');
  });

  it('reintentar devuelve solo los fallidos a la cola y reabre el lote', async () => {
    const lista = await procesos(a.despachoId, 3);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 3,
      items: itemsDe(lista),
    });
    const registrar = (indice: number, resultado: typeof EXITO) =>
      repo.registrarResultado(a.despachoId, {
        procesoId: lista[indice]!.id,
        plataforma: 'RAMA_CPNU',
        resultado,
        ahora: AHORA,
      });
    await registrar(0, EXITO);
    await registrar(1, NO_ENCONTRADO);
    await registrar(2, NO_ENCONTRADO);
    expect((await repo.buscar(a.despachoId, id))?.estado).toBe('COMPLETADA');

    const solicitudes = await repo.reintentarFallidos(a.despachoId, id, null);
    expect(solicitudes.map((s) => s.procesoId).sort()).toEqual([lista[1]!.id, lista[2]!.id].sort());
    expect(solicitudes.every((s) => s.despachoId === a.despachoId)).toBe(true);
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({
      completados: 1,
      fallidos: 0,
      pendientes: 2,
    });
    const lote = await repo.buscar(a.despachoId, id);
    expect(lote).toMatchObject({ estado: 'EN_PROCESO', finalizadaEn: null });

    // Un solo ítem.
    await registrar(1, NO_ENCONTRADO);
    await registrar(2, NO_ENCONTRADO);
    const items = await repo.items(a.despachoId, id);
    const uno = items.find((i) => i.procesoId === lista[1]!.id)!;
    const reintentado = await repo.reintentarFallidos(a.despachoId, id, uno.id);
    expect(reintentado.map((s) => s.procesoId)).toEqual([lista[1]!.id]);
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ fallidos: 1, pendientes: 1 });
  });
});

describe('consultas asistidas dentro de un lote', () => {
  it('abrir el pendiente de la masiva y confirmarlo completa el ítem', async () => {
    const pendientes = crearRepositorioDePendientes((id) => crearClienteDeDespacho(prisma, id));
    const [p] = await procesos(a.despachoId, 1);
    const nunc = digitosAleatorios(21);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: [
        {
          tipo: 'NUNC',
          identificador: nunc,
          procesoId: p!.id,
          plataforma: 'SPOA',
          estado: 'PENDIENTE_CONFIRMACION',
        },
      ],
    });
    const abiertos = await pendientes.abrirDeConsultaMasiva(a.despachoId, [
      { procesoId: p!.id, plataforma: 'SPOA' },
    ]);
    expect(abiertos).toBe(1);
    // Otra vez: ya hay uno abierto, no se duplica.
    expect(
      await pendientes.abrirDeConsultaMasiva(a.despachoId, [
        { procesoId: p!.id, plataforma: 'SPOA' },
      ]),
    ).toBe(0);
    const fila = await prisma.pendienteDeConfirmacion.findFirst({
      where: { procesoId: p!.id, resueltoEn: null },
    });
    expect(fila?.origen).toBe('MASIVA');

    const resueltos = await repo.resolverAsistidos(a.despachoId, {
      procesoId: p!.id,
      plataforma: 'SPOA',
      resumen: { mensaje: 'Sin actuaciones nuevas en SPOA.', nuevas: 0, total: null },
      ahora: AHORA,
    });
    expect(resueltos).toBe(1);
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ completados: 1, porConfirmar: 0 });
  });
});

describe('aislamiento entre despachos', () => {
  it('otro despacho no ve el lote, sus ítems ni puede cambiarlos', async () => {
    const lista = await procesos(a.despachoId, 1);
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 1,
      items: itemsDe(lista),
    });

    expect(await repo.buscar(b.despachoId, id)).toBeNull();
    expect(await repo.items(b.despachoId, id)).toEqual([]);
    expect(await repo.conteo(b.despachoId, id)).toMatchObject({ total: 0 });
    expect(await repo.listar(b.despachoId, { creadaPorId: null }, 50)).not.toContainEqual(
      expect.objectContaining({ id }),
    );
    expect(await repo.reintentarFallidos(b.despachoId, id, null)).toEqual([]);
    expect(
      await repo.registrarResultado(b.despachoId, {
        procesoId: lista[0]!.id,
        plataforma: 'RAMA_CPNU',
        resultado: EXITO,
        ahora: AHORA,
      }),
    ).toBe(0);
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ pendientes: 1 });
    expect(
      await repo.procesosPorIdentificadores(b.despachoId, {
        radicados: [lista[0]!.radicado],
        nuncs: [],
      }),
    ).toEqual([]);
  });
});

describe('lote de 400 procesos', () => {
  it('crea 400 ítems y los termina todos; el lote se cierra solo al final', async () => {
    const lista = await procesos(a.despachoId, 400);
    const inicio = performance.now();
    const { id } = await repo.crear(a.despachoId, {
      creadaPorId: a.membresiaId,
      ahora: AHORA,
      totalProcesos: 400,
      items: itemsDe(lista),
    });
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({ total: 400, pendientes: 400 });

    for (const [indice, p] of lista.entries()) {
      await repo.registrarResultado(a.despachoId, {
        procesoId: p.id,
        plataforma: 'RAMA_CPNU',
        resultado: indice % 50 === 0 ? NO_ENCONTRADO : EXITO,
        ahora: AHORA,
      });
      if (indice === 398) expect((await repo.buscar(a.despachoId, id))?.estado).toBe('EN_PROCESO');
    }
    expect(await repo.conteo(a.despachoId, id)).toMatchObject({
      total: 400,
      completados: 392,
      fallidos: 8,
      pendientes: 0,
    });
    expect((await repo.buscar(a.despachoId, id))?.estado).toBe('COMPLETADA');
    expect(await repo.items(a.despachoId, id)).toHaveLength(400);
    // Solo la base de datos: el trabajo real lo hace la cola, a su ritmo.
    expect(performance.now() - inicio).toBeLessThan(60_000);
  });

  it('la base de datos rechaza un lote de más de 400 procesos', async () => {
    await expect(
      prisma.consultaMasiva.create({
        data: { despachoId: a.despachoId, creadaPorId: a.membresiaId, totalItems: 401 },
      }),
    ).rejects.toThrow();
  });
});
