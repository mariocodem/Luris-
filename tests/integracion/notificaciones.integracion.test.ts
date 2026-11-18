import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { PREFERENCIAS_POR_DEFECTO } from '@/modules/notificaciones/domain/preferencias';
import { crearRepositorioDeNotificaciones } from '@/modules/notificaciones/infrastructure/repositorio-de-notificaciones-prisma';
import { crearRepositorioDeSesionDeWhatsapp } from '@/modules/notificaciones/infrastructure/repositorio-de-sesion-whatsapp-prisma';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  sufijoUnico,
  type EscenarioDeDespacho,
} from './apoyo';

/** Notificaciones y sesión de WhatsApp (Fase 11) sobre PostgreSQL real. */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let repo: ReturnType<typeof crearRepositorioDeNotificaciones>;
let sesiones: ReturnType<typeof crearRepositorioDeSesionDeWhatsapp>;

const AHORA = new Date('2026-11-18T15:00:00Z');

async function persona(despachoId: string, rol: string, activa = true) {
  const sufijo = sufijoUnico();
  const usuario = await prisma.usuario.create({
    data: { nombre: `Persona ${sufijo}`, email: `persona-${sufijo}@pruebas.test` },
  });
  const membresia = await prisma.membresia.create({
    data: { despachoId, usuarioId: usuario.id, rol, activa },
  });
  return { membresiaId: membresia.id, email: usuario.email, nombre: usuario.nombre };
}

/** Un proceso con una actuación, con las fechas oficiales indicadas. */
async function procesoConActuacion(
  despachoId: string,
  opciones: { asignados?: { membresiaId: string; tipo: 'RESPONSABLE' | 'ASIGNADO' }[] } = {},
) {
  const proceso = await prisma.proceso.create({
    data: { despachoId, radicado: digitosAleatorios(23), alias: 'Ejecutivo de prueba' },
  });
  for (const asignado of opciones.asignados ?? []) {
    await prisma.asignacionProceso.create({
      data: { despachoId, procesoId: proceso.id, ...asignado },
    });
  }
  const pp = await prisma.procesoPlataforma.create({
    data: { despachoId, procesoId: proceso.id, plataforma: 'RAMA_CPNU' },
  });
  const actuacion = await prisma.actuacion.create({
    data: {
      despachoId,
      procesoPlataformaId: pp.id,
      claveDeduplicacion: `clave-${sufijoUnico()}`,
      fechaActuacion: new Date('2026-10-21'),
      fechaRegistro: new Date('2026-10-30'),
      descripcion: 'Agregar Memorial',
      tieneDocumentos: true,
      origen: 'TYBA',
    },
  });
  return { procesoId: proceso.id, radicado: proceso.radicado as string, actuacionId: actuacion.id };
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  const paraDespacho = (id: string) => crearClienteDeDespacho(prisma, id);
  repo = crearRepositorioDeNotificaciones(paraDespacho);
  sesiones = crearRepositorioDeSesionDeWhatsapp({ paraDespacho, sinAislamiento: prisma });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('destinatarios de un proceso', () => {
  it('son las personas activas asignadas, con sus preferencias (o las de por defecto)', async () => {
    const responsable = await persona(a.despachoId, 'abogado');
    const apoyo = await persona(a.despachoId, 'asistente');
    const inactiva = await persona(a.despachoId, 'asistente', false);
    const ajena = await persona(a.despachoId, 'abogado');
    const { procesoId } = await procesoConActuacion(a.despachoId, {
      asignados: [
        { membresiaId: responsable.membresiaId, tipo: 'RESPONSABLE' },
        { membresiaId: apoyo.membresiaId, tipo: 'ASIGNADO' },
        { membresiaId: inactiva.membresiaId, tipo: 'ASIGNADO' },
      ],
    });
    await repo.guardarPreferencias(a.despachoId, apoyo.membresiaId, {
      ...PREFERENCIAS_POR_DEFECTO,
      frecuencia: 'RESUMEN_DIARIO',
    });

    const destinatarios = await repo.destinatariosDeProceso(a.despachoId, procesoId);
    expect(destinatarios.map((d) => d.membresiaId).sort()).toEqual(
      [responsable.membresiaId, apoyo.membresiaId].sort(),
    );
    const delApoyo = destinatarios.find((d) => d.membresiaId === apoyo.membresiaId);
    expect(delApoyo).toMatchObject({ email: apoyo.email, nombre: apoyo.nombre });
    expect(delApoyo?.preferencias.frecuencia).toBe('RESUMEN_DIARIO');
    expect(
      destinatarios.find((d) => d.membresiaId === responsable.membresiaId)?.preferencias,
    ).toEqual(PREFERENCIAS_POR_DEFECTO);
    expect(destinatarios.some((d) => d.membresiaId === ajena.membresiaId)).toBe(false);
  });

  it('sin nadie asignado, son las administradoras del despacho', async () => {
    const admin = await persona(a.despachoId, 'administrador');
    const { procesoId } = await procesoConActuacion(a.despachoId);
    const destinatarios = await repo.destinatariosDeProceso(a.despachoId, procesoId);
    expect(destinatarios.map((d) => d.membresiaId)).toContain(admin.membresiaId);
    expect(destinatarios.every((d) => d.email.endsWith('@pruebas.test'))).toBe(true);
    // Solo administradoras (el abogado del escenario no).
    expect(destinatarios.map((d) => d.membresiaId)).not.toContain(a.membresiaId);
  });

  it('otro despacho no ve a las personas de este', async () => {
    const { procesoId } = await procesoConActuacion(a.despachoId);
    expect(await repo.destinatariosDeProceso(b.despachoId, procesoId)).toEqual([]);
  });
});

describe('avisos', () => {
  it('programar es idempotente: la misma actuación, persona y canal no se repite', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    const { actuacionId } = await procesoConActuacion(a.despachoId);
    const fila = {
      actuacionId,
      membresiaId: quien.membresiaId,
      canal: 'CORREO' as const,
      programadaPara: AHORA,
    };
    expect(await repo.programar(a.despachoId, [fila])).toBe(1);
    expect(await repo.programar(a.despachoId, [fila])).toBe(0);
    // Otro canal para la misma persona sí es otro aviso.
    expect(await repo.programar(a.despachoId, [{ ...fila, canal: 'WHATSAPP' }, fila])).toBe(1);
    expect(await prisma.notificacion.count({ where: { actuacionId } })).toBe(2);
  });

  it('reclamar toma los vencidos con sus fechas oficiales, los arrienda y no los entrega dos veces', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    const proceso = await procesoConActuacion(a.despachoId);
    await repo.programar(a.despachoId, [
      {
        actuacionId: proceso.actuacionId,
        membresiaId: quien.membresiaId,
        canal: 'CORREO',
        programadaPara: AHORA,
      },
    ]);
    const futura = await procesoConActuacion(a.despachoId);
    await repo.programar(a.despachoId, [
      {
        actuacionId: futura.actuacionId,
        membresiaId: quien.membresiaId,
        canal: 'CORREO',
        programadaPara: new Date(AHORA.getTime() + 3_600_000),
      },
    ]);

    const opciones = { ahora: AHORA, limite: 500, arriendoMs: 600_000 };
    const reclamadas = (await repo.reclamarVencidas(a.despachoId, opciones)).filter(
      (r) => r.membresiaId === quien.membresiaId,
    );
    expect(reclamadas).toHaveLength(1);
    const [aviso] = reclamadas;
    expect(aviso).toMatchObject({
      intentos: 1,
      canal: 'CORREO',
      destinatario: { email: quien.email },
      proceso: {
        procesoId: proceso.procesoId,
        radicado: proceso.radicado,
        alias: 'Ejecutivo de prueba',
      },
      actuacion: {
        id: proceso.actuacionId,
        plataforma: 'RAMA_CPNU',
        origen: 'TYBA',
        tieneDocumentos: true,
      },
    });
    // Fechas OFICIALES de la plataforma, no la de detección.
    expect(aviso?.actuacion.fechaActuacion).toEqual(new Date('2026-10-21T00:00:00Z'));
    expect(aviso?.actuacion.fechaRegistro).toEqual(new Date('2026-10-30T00:00:00Z'));

    // Arrendado: otra pasada inmediata no lo vuelve a tomar.
    const otra = (await repo.reclamarVencidas(a.despachoId, opciones)).filter(
      (r) => r.membresiaId === quien.membresiaId,
    );
    expect(otra).toHaveLength(0);
    // Pasado el arriendo, vuelve a estar disponible (el envío se cayó a la mitad).
    const despues = (
      await repo.reclamarVencidas(a.despachoId, {
        ...opciones,
        ahora: new Date(AHORA.getTime() + 601_000),
      })
    ).filter((r) => r.membresiaId === quien.membresiaId);
    expect(despues.map((d) => d.intentos)).toEqual([2]);
  });

  it('marca enviadas, fallidas o reprogramadas, y la persona ve solo las suyas', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    const otra = await persona(a.despachoId, 'abogado');
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const p = await procesoConActuacion(a.despachoId);
      await repo.programar(a.despachoId, [
        {
          actuacionId: p.actuacionId,
          membresiaId: quien.membresiaId,
          canal: 'CORREO',
          programadaPara: AHORA,
        },
      ]);
      const fila = await prisma.notificacion.findFirstOrThrow({
        where: { actuacionId: p.actuacionId, membresiaId: quien.membresiaId },
      });
      ids.push(fila.id);
    }
    const pOtra = await procesoConActuacion(a.despachoId);
    await repo.programar(a.despachoId, [
      {
        actuacionId: pOtra.actuacionId,
        membresiaId: otra.membresiaId,
        canal: 'CORREO',
        programadaPara: AHORA,
      },
    ]);

    const [enviada, fallida, reprogramada] = ids as [string, string, string];
    await repo.marcarEnviadas(a.despachoId, [enviada], AHORA);
    await repo.marcarFallidas(a.despachoId, [fallida], 'DESTINO_INVALIDO');
    const para = new Date(AHORA.getTime() + 60_000);
    await repo.reprogramar(a.despachoId, [reprogramada], para, 'FALLO_TEMPORAL');

    const lista = await repo.deLaPersona(a.despachoId, quien.membresiaId, 50);
    expect(lista).toHaveLength(3);
    const por = (id: string) => lista.find((l) => l.id === id);
    expect(por(enviada)).toMatchObject({ estado: 'ENVIADA', enviadaEn: AHORA, codigoError: null });
    expect(por(fallida)).toMatchObject({ estado: 'FALLIDA', codigoError: 'DESTINO_INVALIDO' });
    expect(por(reprogramada)).toMatchObject({
      estado: 'PENDIENTE',
      codigoError: 'FALLO_TEMPORAL',
      programadaPara: para,
    });
    // Las fechas que ve la persona son las oficiales.
    expect(por(enviada)?.actuacion.fechaActuacion).toEqual(new Date('2026-10-21T00:00:00Z'));
    // Y no ve las de otra persona.
    expect(lista.some((l) => l.proceso.procesoId === pOtra.procesoId)).toBe(false);
  });

  it('otro despacho no reclama ni ve los avisos de este', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    const p = await procesoConActuacion(a.despachoId);
    await repo.programar(a.despachoId, [
      {
        actuacionId: p.actuacionId,
        membresiaId: quien.membresiaId,
        canal: 'CORREO',
        programadaPara: AHORA,
      },
    ]);
    const deB = await repo.reclamarVencidas(b.despachoId, {
      ahora: AHORA,
      limite: 500,
      arriendoMs: 1000,
    });
    expect(deB.every((r) => r.membresiaId !== quien.membresiaId)).toBe(true);
    expect(await repo.deLaPersona(b.despachoId, quien.membresiaId, 50)).toEqual([]);
    const fila = await prisma.notificacion.findFirstOrThrow({
      where: { actuacionId: p.actuacionId },
    });
    await repo.marcarEnviadas(b.despachoId, [fila.id], AHORA);
    expect((await prisma.notificacion.findUniqueOrThrow({ where: { id: fila.id } })).estado).toBe(
      'PENDIENTE',
    );
  });
});

describe('aviso al terminar una consulta masiva', () => {
  async function lote(opciones: { finalizadaEn: Date; notificadaEn?: Date }) {
    const quien = await persona(a.despachoId, 'abogado');
    const consulta = await prisma.consultaMasiva.create({
      data: {
        despachoId: a.despachoId,
        creadaPorId: quien.membresiaId,
        totalItems: 2,
        estado: 'COMPLETADA',
        finalizadaEn: opciones.finalizadaEn,
        notificadaEn: opciones.notificadaEn ?? null,
      },
    });
    await prisma.itemConsultaMasiva.createMany({
      data: ['COMPLETADO', 'FALLIDO'].map((estado, i) => ({
        despachoId: a.despachoId,
        consultaMasivaId: consulta.id,
        tipoIdentificador: 'RADICADO' as const,
        identificador: digitosAleatorios(23) + String(i).slice(0, 0),
        plataforma: 'RAMA_CPNU' as const,
        estado: estado as 'COMPLETADO' | 'FALLIDO',
      })),
    });
    return { consultaId: consulta.id, quien };
  }

  it('lista las terminadas sin avisar, con su conteo, y una vez avisadas no vuelven', async () => {
    const reciente = await lote({ finalizadaEn: new Date(AHORA.getTime() - 60_000) });
    const vieja = await lote({ finalizadaEn: new Date(AHORA.getTime() - 3 * 86_400_000) });
    const avisada = await lote({
      finalizadaEn: new Date(AHORA.getTime() - 60_000),
      notificadaEn: AHORA,
    });
    const desde = new Date(AHORA.getTime() - 86_400_000);

    const pendientes = await repo.lotesTerminadosSinAviso(a.despachoId, desde);
    const ids = pendientes.map((p) => p.consultaId);
    expect(ids).toContain(reciente.consultaId);
    expect(ids).not.toContain(vieja.consultaId);
    expect(ids).not.toContain(avisada.consultaId);
    const del = pendientes.find((p) => p.consultaId === reciente.consultaId);
    expect(del).toMatchObject({
      procesos: 2,
      destinatario: { email: reciente.quien.email },
      conteo: { total: 2, completados: 1, fallidos: 1 },
    });

    await repo.marcarLoteAvisado(a.despachoId, reciente.consultaId, AHORA);
    expect(
      (await repo.lotesTerminadosSinAviso(a.despachoId, desde)).map((p) => p.consultaId),
    ).not.toContain(reciente.consultaId);
    // Otro despacho no los ve.
    expect(await repo.lotesTerminadosSinAviso(b.despachoId, desde)).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ consultaId: reciente.consultaId })]),
    );
  });
});

describe('preferencias', () => {
  it('no hay hasta que se guardan; después se actualizan', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    expect(await repo.obtenerPreferencias(a.despachoId, quien.membresiaId)).toBeNull();
    const consentimiento = new Date('2026-11-01T10:00:00Z');
    await repo.guardarPreferencias(a.despachoId, quien.membresiaId, {
      correoActivo: true,
      whatsappActivo: true,
      numeroWhatsapp: '573001234567',
      consentimientoWhatsappEn: consentimiento,
      frecuencia: 'RESUMEN_DIARIO',
    });
    expect(await repo.obtenerPreferencias(a.despachoId, quien.membresiaId)).toEqual({
      correoActivo: true,
      whatsappActivo: true,
      numeroWhatsapp: '573001234567',
      consentimientoWhatsappEn: consentimiento,
      frecuencia: 'RESUMEN_DIARIO',
    });
    await repo.guardarPreferencias(a.despachoId, quien.membresiaId, PREFERENCIAS_POR_DEFECTO);
    expect(await repo.obtenerPreferencias(a.despachoId, quien.membresiaId)).toEqual(
      PREFERENCIAS_POR_DEFECTO,
    );
    expect(
      await prisma.preferenciaNotificacion.count({ where: { membresiaId: quien.membresiaId } }),
    ).toBe(1);
  });

  it('otro despacho no las ve ni las pisa', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    await repo.guardarPreferencias(a.despachoId, quien.membresiaId, PREFERENCIAS_POR_DEFECTO);
    expect(await repo.obtenerPreferencias(b.despachoId, quien.membresiaId)).toBeNull();
  });

  it('la base de datos rechaza WhatsApp activo sin número ni consentimiento', async () => {
    const quien = await persona(a.despachoId, 'abogado');
    await expect(
      prisma.preferenciaNotificacion.create({
        data: { despachoId: a.despachoId, membresiaId: quien.membresiaId, whatsappActivo: true },
      }),
    ).rejects.toThrow();
  });
});

describe('sesión de WhatsApp del despacho', () => {
  it('guarda y devuelve los bytes cifrados tal cual, con su versión de clave', async () => {
    const qr = { datos: new Uint8Array([1, 2, 3, 250]), version: 1 };
    await sesiones.actualizar(a.despachoId, { estado: 'VINCULANDO', qr, qrGeneradoEn: AHORA });
    const leida = await sesiones.obtener(a.despachoId);
    expect(leida).toMatchObject({ estado: 'VINCULANDO', qrGeneradoEn: AHORA });
    expect([...(leida.qr?.datos ?? [])]).toEqual([1, 2, 3, 250]);
    expect(leida.qr?.version).toBe(1);

    await sesiones.guardarDatos(a.despachoId, { datos: new Uint8Array([9, 8, 7]), version: 1 });
    const datos = await sesiones.cargarDatos(a.despachoId);
    expect([...(datos?.datos ?? [])]).toEqual([9, 8, 7]);

    await sesiones.actualizar(a.despachoId, {
      estado: 'CONECTADA',
      numero: '573001234567',
      qr: null,
      qrGeneradoEn: null,
      conectadaEn: AHORA,
    });
    expect(await sesiones.obtener(a.despachoId)).toMatchObject({
      estado: 'CONECTADA',
      numero: '573001234567',
      qr: null,
      conectadaEn: AHORA,
    });
    // Los datos de la sesión siguen guardados aunque se borre el QR.
    expect(await sesiones.cargarDatos(a.despachoId)).not.toBeNull();
  });

  it('el worker la encuentra al iniciar solo si tiene datos y el despacho está activo', async () => {
    expect(await sesiones.despachosConSesion()).toContain(a.despachoId);
    expect(await sesiones.despachosConSesion()).not.toContain(b.despachoId);
    await prisma.despacho.update({ where: { id: a.despachoId }, data: { estado: 'SUSPENDIDO' } });
    expect(await sesiones.despachosConSesion()).not.toContain(a.despachoId);
    await prisma.despacho.update({ where: { id: a.despachoId }, data: { estado: 'ACTIVO' } });
  });

  it('otro despacho no ve la sesión ni sus datos', async () => {
    expect(await sesiones.cargarDatos(b.despachoId)).toBeNull();
    expect((await sesiones.obtener(b.despachoId)).numero).toBeNull();
    await sesiones.reiniciar(b.despachoId);
    expect(await sesiones.cargarDatos(a.despachoId)).not.toBeNull();
  });

  it('solicitar vinculación borra el QR anterior y marca el pedido', async () => {
    await sesiones.solicitarVinculacion(a.despachoId, AHORA);
    expect(await sesiones.obtener(a.despachoId)).toMatchObject({
      estado: 'VINCULANDO',
      qr: null,
      vinculacionSolicitadaEn: AHORA,
    });
  });

  it('reiniciar borra credenciales, claves y QR', async () => {
    await sesiones.reiniciar(a.despachoId);
    expect(await sesiones.obtener(a.despachoId)).toMatchObject({
      estado: 'SIN_VINCULAR',
      numero: null,
      qr: null,
    });
    expect(await sesiones.cargarDatos(a.despachoId)).toBeNull();
    expect(await sesiones.despachosConSesion()).not.toContain(a.despachoId);
  });

  it('la base rechaza datos sin versión de clave', async () => {
    await expect(
      prisma.sesionWhatsapp.create({
        data: { despachoId: a.despachoId, datosCifrados: Buffer.from([1]) },
      }),
    ).rejects.toThrow();
  });
});
