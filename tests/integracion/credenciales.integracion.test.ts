import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearRepositorioDeDocumentos } from '@/modules/documentos/infrastructure/repositorio-de-documentos-prisma';
import { crearRepositorioDeCredenciales } from '@/modules/plataformas/infrastructure/repositorio-de-credenciales-prisma';
import { crearClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  crearClienteDePruebas,
  crearEscenarioDeDespacho,
  sufijoUnico,
  type EscenarioDeDespacho,
} from './apoyo';

/** Credenciales de plataformas y documentos subidos a mano (Fase 7) sobre PostgreSQL real. */

let prisma: PrismaClient;
let a: EscenarioDeDespacho;
let b: EscenarioDeDespacho;
let repo: ReturnType<typeof crearRepositorioDeCredenciales>;

const secreto = (n: number) => ({ datos: new Uint8Array([n, n, n, n]), version: 1 });

async function miembro(despachoId: string): Promise<string> {
  const sufijo = sufijoUnico();
  const usuario = await prisma.usuario.create({
    data: { nombre: `Abogado ${sufijo}`, email: `abogado-${sufijo}@pruebas.test` },
  });
  const membresia = await prisma.membresia.create({
    data: { despachoId, usuarioId: usuario.id, rol: 'abogado' },
  });
  return membresia.id;
}

beforeAll(async () => {
  prisma = crearClienteDePruebas();
  a = await crearEscenarioDeDespacho(prisma);
  b = await crearEscenarioDeDespacho(prisma);
  repo = crearRepositorioDeCredenciales((id) => crearClienteDeDespacho(prisma, id));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('credenciales de plataformas', () => {
  it('una personal por persona y plataforma: guardar de nuevo la reemplaza y reinicia la verificación', async () => {
    const membresiaId = await miembro(a.despachoId);
    const datos = {
      membresiaId,
      plataforma: 'SAMAI' as const,
      alcance: 'PERSONAL' as const,
      usuario: 'abogado.uno',
      secreto: secreto(1),
      consentimientoEn: new Date(),
    };
    const primera = await repo.guardar(a.despachoId, datos);
    await repo.registrarVerificacion(a.despachoId, primera.id, 'EXITOSA', new Date());
    const segunda = await repo.guardar(a.despachoId, {
      ...datos,
      usuario: 'abogado.dos',
      secreto: secreto(2),
    });

    expect(segunda.id).toBe(primera.id);
    const guardada = await repo.buscar(a.despachoId, primera.id);
    expect(guardada).toMatchObject({ usuario: 'abogado.dos', alcance: 'PERSONAL', membresiaId });
    expect([...(guardada?.secreto.datos ?? [])]).toEqual([2, 2, 2, 2]);

    const [listada] = await repo.listar(a.despachoId, { membresiaId, incluirDelDespacho: false });
    expect(listada).toMatchObject({
      usuario: 'abogado.dos',
      verificadaEn: null,
      estadoVerificacion: null,
    });
    expect(listada).not.toHaveProperty('secreto');
    expect(listada?.titular).toMatch(/^Abogado /);
  });

  it('una sola del despacho por plataforma, aunque la registre otra persona', async () => {
    const admin1 = await miembro(a.despachoId);
    const admin2 = await miembro(a.despachoId);
    const base = {
      plataforma: 'SAMAI' as const,
      alcance: 'DESPACHO' as const,
      secreto: secreto(3),
      consentimientoEn: new Date(),
    };
    const una = await repo.guardar(a.despachoId, {
      ...base,
      membresiaId: admin1,
      usuario: 'despacho',
    });
    const otra = await repo.guardar(a.despachoId, {
      ...base,
      membresiaId: admin2,
      usuario: 'despacho2',
    });
    expect(otra.id).toBe(una.id);
    expect(
      await prisma.credencialPlataforma.count({
        where: { despachoId: a.despachoId, alcance: 'DESPACHO', plataforma: 'SAMAI' },
      }),
    ).toBe(1);
  });

  it('cada despacho solo ve y borra las suyas', async () => {
    const membresiaId = await miembro(a.despachoId);
    const { id } = await repo.guardar(a.despachoId, {
      membresiaId,
      plataforma: 'SAMAI',
      alcance: 'PERSONAL',
      usuario: 'privada',
      secreto: secreto(4),
      consentimientoEn: new Date(),
    });
    expect(await repo.buscar(b.despachoId, id)).toBeNull();
    await repo.eliminar(b.despachoId, id);
    expect(await repo.buscar(a.despachoId, id)).not.toBeNull();
    await repo.eliminar(a.despachoId, id);
    expect(await repo.buscar(a.despachoId, id)).toBeNull();
    // Registrar la verificación de una credencial borrada no falla.
    await expect(
      repo.registrarVerificacion(a.despachoId, id, 'EXITOSA', new Date()),
    ).resolves.toBeUndefined();
  });

  it('la base exige que la verificación tenga fecha y resultado a la vez', async () => {
    await expect(
      prisma.credencialPlataforma.update({
        where: { id: a.credencialId },
        data: { verificadaEn: new Date(), estadoVerificacion: null },
      }),
    ).rejects.toThrow();
  });
});

describe('documentos subidos a mano', () => {
  it('quedan guardados, con quién los subió, y marcan la actuación con documentos', async () => {
    const documentos = crearRepositorioDeDocumentos((id) => crearClienteDeDespacho(prisma, id));
    expect(await documentos.procesoDeLaActuacion(a.despachoId, a.actuacionId)).toBe(a.procesoId);
    expect(await documentos.procesoDeLaActuacion(b.despachoId, a.actuacionId)).toBeNull();

    const { id } = await documentos.registrarSubido(a.despachoId, {
      actuacionId: a.actuacionId,
      nombre: 'Auto admite.pdf',
      tipoMime: 'application/pdf',
      ruta: `${a.despachoId}/ab/${'b'.repeat(64)}`,
      sha256: 'b'.repeat(64),
      tamanoBytes: 2048,
      subidoPorId: a.membresiaId,
      ahora: new Date(),
    });
    expect(await documentos.paraAbrir(a.despachoId, id)).toMatchObject({
      procesoId: a.procesoId,
      tipoMime: 'application/pdf',
    });
    const fila = await prisma.documento.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({ estado: 'DESCARGADO', subidoPorId: a.membresiaId });
  });

  it('la base no acepta un documento «subido» que no esté guardado, ni subido por alguien de otro despacho', async () => {
    await expect(
      prisma.documento.create({
        data: {
          despachoId: a.despachoId,
          actuacionId: a.actuacionId,
          nombre: 'x.pdf',
          subidoPorId: a.membresiaId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.documento.create({
        data: {
          despachoId: a.despachoId,
          actuacionId: a.actuacionId,
          nombre: 'x.pdf',
          estado: 'DESCARGADO',
          tipoMime: 'application/pdf',
          tamanoBytes: 1,
          sha256: 'c'.repeat(64),
          rutaAlmacenamiento: 'r',
          descargadoEn: new Date(),
          subidoPorId: b.membresiaId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('credenciales con ingreso: cuenta por proceso, sesión y código (Fase 8)', () => {
  async function proceso(despachoId: string): Promise<string> {
    const nuevo = await prisma.proceso.create({
      data: {
        despachoId,
        radicado: `0500131050${String(Date.now()).slice(-8)}12300`.slice(0, 23),
        alias: 'Laboral',
      },
    });
    return nuevo.id;
  }

  async function guardarPersonal(despachoId: string, membresiaId: string, usuario: string) {
    return repo.guardar(despachoId, {
      membresiaId,
      plataforma: 'SIUGJ',
      alcance: 'PERSONAL',
      usuario,
      secreto: secreto(3),
      consentimientoEn: new Date(),
    });
  }

  it('ordena las cuentas del proceso: responsable, otras personas asignadas activas y el despacho', async () => {
    const procesoId = await proceso(a.despachoId);
    const responsable = await miembro(a.despachoId);
    const apoyo = await miembro(a.despachoId);
    const inactiva = await miembro(a.despachoId);
    const ajena = await miembro(a.despachoId);
    await prisma.asignacionProceso.createMany({
      data: [
        { despachoId: a.despachoId, procesoId, membresiaId: apoyo, tipo: 'ASIGNADO' },
        { despachoId: a.despachoId, procesoId, membresiaId: responsable, tipo: 'RESPONSABLE' },
        { despachoId: a.despachoId, procesoId, membresiaId: inactiva, tipo: 'ASIGNADO' },
      ],
    });
    await prisma.membresia.update({ where: { id: inactiva }, data: { activa: false } });
    await repo.guardar(a.despachoId, {
      membresiaId: ajena,
      plataforma: 'SIUGJ',
      alcance: 'DESPACHO',
      usuario: 'cuenta.despacho',
      secreto: secreto(4),
      consentimientoEn: new Date(),
    });
    await guardarPersonal(a.despachoId, apoyo, 'cuenta.apoyo');
    await guardarPersonal(a.despachoId, responsable, 'cuenta.responsable');
    await guardarPersonal(a.despachoId, inactiva, 'cuenta.inactiva');
    // La personal de quien no está asignado al proceso no se usa.
    await guardarPersonal(a.despachoId, ajena, 'cuenta.ajena');

    const cuentas = await repo.paraProceso(a.despachoId, procesoId, 'SIUGJ');
    expect(cuentas.map((c) => c.usuario)).toEqual([
      'cuenta.responsable',
      'cuenta.apoyo',
      'cuenta.despacho',
    ]);
    // Otro despacho no ve nada de este proceso.
    expect(await repo.paraProceso(b.despachoId, procesoId, 'SIUGJ')).toEqual([]);
    // Cada plataforma solo trae sus propias credenciales.
    const deSamai = await repo.paraProceso(a.despachoId, procesoId, 'SAMAI');
    expect(deSamai.every((c) => c.plataforma === 'SAMAI')).toBe(true);
  });

  it('guarda y borra la sesión cifrada, marca el código, y una contraseña nueva los reinicia', async () => {
    const membresiaId = await miembro(a.despachoId);
    const { id } = await guardarPersonal(a.despachoId, membresiaId, 'cuenta.sesion');
    const marca = new Date('2026-11-17T15:00:00Z');

    await repo.guardarSesion(a.despachoId, id, secreto(9), marca);
    await repo.marcarCodigoSolicitado(a.despachoId, id, marca);
    let guardada = await repo.buscar(a.despachoId, id);
    expect([...(guardada?.sesion?.datos ?? [])]).toEqual([9, 9, 9, 9]);
    expect(guardada?.codigoSolicitadoEn).toEqual(marca);
    const [listada] = await repo.listar(a.despachoId, { membresiaId, incluirDelDespacho: false });
    expect(listada?.codigoSolicitadoEn).toEqual(marca);
    expect(listada).not.toHaveProperty('sesion');

    // Otro despacho no puede tocarla.
    await repo.guardarSesion(b.despachoId, id, null, marca);
    expect((await repo.buscar(a.despachoId, id))?.sesion).not.toBeNull();

    await guardarPersonal(a.despachoId, membresiaId, 'cuenta.sesion');
    guardada = await repo.buscar(a.despachoId, id);
    expect(guardada?.sesion).toBeNull();
    expect(guardada?.codigoSolicitadoEn).toBeNull();
  });

  it('la base rechaza una sesión cifrada sin la versión de su clave', async () => {
    const membresiaId = await miembro(a.despachoId);
    const { id } = await guardarPersonal(a.despachoId, membresiaId, 'cuenta.check');
    await expect(
      prisma.credencialPlataforma.update({
        where: { id },
        data: { sesionCifrada: new Uint8Array([1]), sesionVersionClave: null },
      }),
    ).rejects.toThrow();
  });
});
