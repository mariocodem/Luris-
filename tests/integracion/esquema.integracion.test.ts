import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { ROLES_DE_DESPACHO } from '@/modules/usuarios/domain/rol-de-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  digitosAleatorios,
  sufijoUnico,
  type EscenarioDeDespacho,
} from './apoyo';

/**
 * Restricciones de la migración inicial: la base de datos rechaza por sí misma los datos que
 * violan las reglas del dominio, aunque un error de programación saltara la validación.
 */

let prisma: PrismaClient;
let e: EscenarioDeDespacho;

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  e = await crearEscenarioDeDespacho(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Espera que la operación falle por la restricción indicada. */
async function esperarViolacion(operacion: Promise<unknown>, restriccion: string): Promise<void> {
  const error: unknown = await operacion.then(
    () => undefined,
    (causa: unknown) => causa,
  );
  expect(error, `se esperaba violar ${restriccion}`).toBeInstanceOf(Error);
  const detalle = `${(error as Error).message} ${JSON.stringify((error as { meta?: unknown }).meta)}`;
  expect(detalle).toContain(restriccion);
}

describe('procesos', () => {
  it('acepta radicados de 23 dígitos con ceros a la izquierda', async () => {
    const radicado = `0${digitosAleatorios(22)}`;
    const proceso = await prisma.proceso.create({ data: { despachoId: e.despachoId, radicado } });
    expect(proceso.radicado).toBe(radicado);
  });

  it.each([
    ['con guiones', '11001-31-03-001-2023-00'],
    ['con espacios', '11001 31 03 001 2023 00'],
    ['con una letra', '1100131030012023001230A'],
    ['de 22 dígitos', '1100131030012023001230'],
  ])('rechaza un radicado %s', async (_caso, radicado) => {
    await esperarViolacion(
      prisma.proceso.create({ data: { despachoId: e.despachoId, radicado } }),
      'procesos_radicado_formato',
    );
  });

  it('rechaza un radicado de más de 23 caracteres (longitud de la columna)', async () => {
    await expect(
      prisma.proceso.create({
        data: { despachoId: e.despachoId, radicado: '11001-31-03-001-2023-00123-00' },
      }),
    ).rejects.toMatchObject({ code: 'P2000' });
  });

  it('rechaza un NUNC que no tenga 21 dígitos', async () => {
    await esperarViolacion(
      prisma.proceso.create({ data: { despachoId: e.despachoId, nunc: '11001-60-00049-2023' } }),
      'procesos_nunc_formato',
    );
  });

  it('exige radicado o NUNC', async () => {
    await esperarViolacion(
      prisma.proceso.create({ data: { despachoId: e.despachoId, alias: 'Sin identificador' } }),
      'procesos_requiere_identificador',
    );
    const soloNunc = await prisma.proceso.create({
      data: { despachoId: e.despachoId, nunc: digitosAleatorios(21) },
    });
    expect(soloNunc.radicado).toBeNull();
  });

  it('un radicado es único dentro del despacho, pero puede repetirse en otro despacho', async () => {
    await expect(
      prisma.proceso.create({ data: { despachoId: e.despachoId, radicado: e.radicado } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const otro = await crearEscenarioDeDespacho(prisma, { radicado: e.radicado });
    expect(otro.radicado).toBe(e.radicado);
  });

  it('un proceso tiene como máximo un abogado responsable', async () => {
    const usuario = await prisma.usuario.create({
      data: { nombre: 'Segundo abogado', email: `segundo-${sufijoUnico()}@pruebas.test` },
    });
    const membresia = await prisma.membresia.create({
      data: { despachoId: e.despachoId, usuarioId: usuario.id, rol: 'abogado' },
    });
    const segundoResponsable = {
      despachoId: e.despachoId,
      procesoId: e.procesoId,
      membresiaId: membresia.id,
    };
    await esperarViolacion(
      prisma.asignacionProceso.create({ data: { ...segundoResponsable, tipo: 'RESPONSABLE' } }),
      'asignaciones_proceso_un_responsable',
    );
    const asignada = await prisma.asignacionProceso.create({
      data: { ...segundoResponsable, tipo: 'ASIGNADO' },
    });
    expect(asignada.tipo).toBe('ASIGNADO');
  });
});

describe('usuarios y membresías', () => {
  it.each(ROLES_DE_DESPACHO)('acepta el rol "%s"', async (rol) => {
    const usuario = await prisma.usuario.create({
      data: { nombre: `Rol ${rol}`, email: `rol-${rol}-${sufijoUnico()}@pruebas.test` },
    });
    const membresia = await prisma.membresia.create({
      data: { despachoId: e.despachoId, usuarioId: usuario.id, rol },
    });
    expect(membresia.rol).toBe(rol);
  });

  it.each(['superadmin', 'owner', 'Administrador', 'abogado,asistente'])(
    'rechaza el rol "%s"',
    async (rol) => {
      const usuario = await prisma.usuario.create({
        data: { nombre: 'Rol inválido', email: `rol-invalido-${sufijoUnico()}@pruebas.test` },
      });
      await esperarViolacion(
        prisma.membresia.create({ data: { despachoId: e.despachoId, usuarioId: usuario.id, rol } }),
        'membresias_rol_valido',
      );
    },
  );

  it('exige el email en minúsculas', async () => {
    await esperarViolacion(
      prisma.usuario.create({
        data: { nombre: 'Mayúsculas', email: `Mayus-${sufijoUnico()}@Pruebas.test` },
      }),
      'usuarios_email_minusculas',
    );
  });

  it('una persona tiene una sola membresía por despacho', async () => {
    await expect(
      prisma.membresia.create({
        data: { despachoId: e.despachoId, usuarioId: e.usuarioId, rol: 'asistente' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('actuaciones y documentos', () => {
  it('guarda las fechas oficiales como día calendario, sin corrimiento por zona horaria', async () => {
    const actuacion = await prisma.actuacion.findUniqueOrThrow({ where: { id: e.actuacionId } });
    expect(actuacion.fechaActuacion.toISOString().slice(0, 10)).toBe('2024-03-01');
    expect(actuacion.fechaRegistro?.toISOString().slice(0, 10)).toBe('2024-03-04');
    // La fecha de detección es otra cosa (auditoría) y nunca reemplaza a las oficiales.
    expect(actuacion.detectadaEn.getTime()).not.toBe(actuacion.fechaActuacion.getTime());
  });

  it('no duplica una actuación con la misma clave en el mismo proceso-plataforma', async () => {
    const actuacion = await prisma.actuacion.findUniqueOrThrow({ where: { id: e.actuacionId } });
    await expect(
      prisma.actuacion.create({
        data: {
          despachoId: e.despachoId,
          procesoPlataformaId: e.procesoPlataformaId,
          claveDeduplicacion: actuacion.claveDeduplicacion,
          fechaActuacion: new Date('2024-03-01'),
          descripcion: 'Duplicada',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('un documento descargado debe tener hash, ruta, tipo y tamaño', async () => {
    await esperarViolacion(
      prisma.documento.update({ where: { id: e.documentoId }, data: { estado: 'DESCARGADO' } }),
      'documentos_descargado_completo',
    );
    const descargado = await prisma.documento.update({
      where: { id: e.documentoId },
      data: {
        estado: 'DESCARGADO',
        sha256: 'a'.repeat(64),
        rutaAlmacenamiento: 'documentos/aa/aaaa.pdf',
        tipoMime: 'application/pdf',
        tamanoBytes: 1024,
        descargadoEn: new Date(),
      },
    });
    expect(descargado.estado).toBe('DESCARGADO');
  });

  it('rechaza un hash SHA-256 mal formado', async () => {
    await esperarViolacion(
      prisma.documento.update({ where: { id: e.documentoId }, data: { sha256: 'NO-ES-UN-HASH' } }),
      'documentos_sha256_formato',
    );
  });
});

describe('credenciales', () => {
  const credencial = (alcance: 'DESPACHO' | 'PERSONAL') => ({
    despachoId: e.despachoId,
    membresiaId: e.membresiaId,
    plataforma: 'SAMAI' as const,
    alcance,
    usuario: 'usuario-samai',
    secretoCifrado: new Uint8Array([9, 9, 9]),
    consentimientoEn: new Date(),
  });

  it('una credencial del despacho y una personal por plataforma, sin duplicados', async () => {
    await prisma.credencialPlataforma.create({ data: credencial('DESPACHO') });
    await prisma.credencialPlataforma.create({ data: credencial('PERSONAL') });
    await esperarViolacion(
      prisma.credencialPlataforma.create({ data: credencial('DESPACHO') }),
      'credenciales_una_por_despacho',
    );
    await esperarViolacion(
      prisma.credencialPlataforma.create({ data: credencial('PERSONAL') }),
      'credenciales_una_personal',
    );
  });

  it('rechaza un secreto vacío', async () => {
    await esperarViolacion(
      prisma.credencialPlataforma.create({
        data: {
          ...credencial('PERSONAL'),
          plataforma: 'SIUGJ',
          membresiaId: e.membresiaId,
          secretoCifrado: new Uint8Array(),
        },
      }),
      'credenciales_secreto_no_vacio',
    );
  });
});

describe('consulta masiva', () => {
  it.each([0, 401])('rechaza un lote de %i ítems', async (totalItems) => {
    await esperarViolacion(
      prisma.consultaMasiva.create({
        data: { despachoId: e.despachoId, creadaPorId: e.membresiaId, totalItems },
      }),
      'consultas_masivas_total_items_rango',
    );
  });

  it('acepta un lote de 400 ítems', async () => {
    const lote = await prisma.consultaMasiva.create({
      data: { despachoId: e.despachoId, creadaPorId: e.membresiaId, totalItems: 400 },
    });
    expect(lote.totalItems).toBe(400);
  });

  it('el identificador debe coincidir con su tipo', async () => {
    await esperarViolacion(
      prisma.itemConsultaMasiva.create({
        data: {
          despachoId: e.despachoId,
          consultaMasivaId: e.consultaMasivaId,
          tipoIdentificador: 'NUNC',
          identificador: digitosAleatorios(23),
          plataforma: 'SPOA',
        },
      }),
      'items_consulta_masiva_identificador_formato',
    );
  });
});

describe('notificaciones', () => {
  it('WhatsApp solo se activa con número y consentimiento', async () => {
    await esperarViolacion(
      prisma.preferenciaNotificacion.update({
        where: { id: e.preferenciaId },
        data: { whatsappActivo: true },
      }),
      'preferencias_whatsapp_requiere_consentimiento',
    );
    const activada = await prisma.preferenciaNotificacion.update({
      where: { id: e.preferenciaId },
      data: {
        whatsappActivo: true,
        numeroWhatsapp: '573001234567',
        consentimientoWhatsappEn: new Date(),
      },
    });
    expect(activada.whatsappActivo).toBe(true);
  });

  it('nunca registra dos envíos de la misma actuación a la misma persona por el mismo canal', async () => {
    await expect(
      prisma.notificacion.create({
        data: {
          despachoId: e.despachoId,
          membresiaId: e.membresiaId,
          actuacionId: e.actuacionId,
          canal: 'CORREO',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const porWhatsapp = await prisma.notificacion.create({
      data: {
        despachoId: e.despachoId,
        membresiaId: e.membresiaId,
        actuacionId: e.actuacionId,
        canal: 'WHATSAPP',
      },
    });
    expect(porWhatsapp.canal).toBe('WHATSAPP');
  });
});

describe('borrado de un despacho', () => {
  it('elimina en cascada todos sus datos (derecho de supresión, Ley 1581)', async () => {
    const temporal = await crearEscenarioDeDespacho(prisma);
    await prisma.despacho.delete({ where: { id: temporal.despachoId } });

    const restantes = await Promise.all([
      prisma.proceso.count({ where: { despachoId: temporal.despachoId } }),
      prisma.actuacion.count({ where: { despachoId: temporal.despachoId } }),
      prisma.documento.count({ where: { despachoId: temporal.despachoId } }),
      prisma.credencialPlataforma.count({ where: { despachoId: temporal.despachoId } }),
      prisma.notificacion.count({ where: { despachoId: temporal.despachoId } }),
      prisma.registroAuditoria.count({ where: { despachoId: temporal.despachoId } }),
    ]);
    expect(restantes).toEqual([0, 0, 0, 0, 0, 0]);
    // El usuario es global: sobrevive aunque se borre el despacho.
    expect(await prisma.usuario.count({ where: { id: temporal.usuarioId } })).toBe(1);
  });
});
