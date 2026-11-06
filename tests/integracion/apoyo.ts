import { randomInt, randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { crearClientePrisma } from '@/shared/infrastructure/prisma/cliente';

/** Cliente SIN aislamiento conectado a la base de pruebas (para preparar escenarios). */
export function crearClienteDePruebas(): PrismaClient {
  return crearClientePrisma(inject('urlBaseDeDatosPruebas'));
}

export function digitosAleatorios(cantidad: number): string {
  return Array.from({ length: cantidad }, () => randomInt(10)).join('');
}

export function sufijoUnico(): string {
  return randomUUID().slice(0, 8);
}

export interface EscenarioDeDespacho {
  readonly despachoId: string;
  readonly usuarioId: string;
  readonly membresiaId: string;
  readonly procesoId: string;
  readonly radicado: string;
  readonly asignacionId: string;
  readonly etiquetaId: string;
  readonly procesoPlataformaId: string;
  readonly actuacionId: string;
  readonly documentoId: string;
  readonly credencialId: string;
  readonly consultaMasivaId: string;
  readonly preferenciaId: string;
  readonly notificacionId: string;
  readonly registroAuditoriaId: string;
}

/**
 * Crea un despacho con al menos una fila en cada tabla de negocio, para que las pruebas de
 * aislamiento puedan verificar todos los modelos.
 */
export async function crearEscenarioDeDespacho(
  prisma: PrismaClient,
  opciones: { radicado?: string } = {},
): Promise<EscenarioDeDespacho> {
  const sufijo = sufijoUnico();
  const radicado = opciones.radicado ?? digitosAleatorios(23);

  const despacho = await prisma.despacho.create({
    data: { nombre: `Despacho ${sufijo}`, slug: `despacho-${sufijo}` },
  });
  const despachoId = despacho.id;
  const usuario = await prisma.usuario.create({
    data: { nombre: `Abogada ${sufijo}`, email: `abogada-${sufijo}@pruebas.test` },
  });
  const membresia = await prisma.membresia.create({
    data: { despachoId, usuarioId: usuario.id, rol: 'abogado' },
  });
  const proceso = await prisma.proceso.create({
    data: { despachoId, radicado, alias: `Proceso ${sufijo}` },
  });
  const asignacion = await prisma.asignacionProceso.create({
    data: { despachoId, procesoId: proceso.id, membresiaId: membresia.id, tipo: 'RESPONSABLE' },
  });
  const etiqueta = await prisma.etiqueta.create({ data: { despachoId, nombre: 'Civil' } });
  await prisma.etiquetaProceso.create({
    data: { despachoId, procesoId: proceso.id, etiquetaId: etiqueta.id },
  });
  const procesoPlataforma = await prisma.procesoPlataforma.create({
    data: { despachoId, procesoId: proceso.id, plataforma: 'RAMA_CPNU' },
  });
  const actuacion = await prisma.actuacion.create({
    data: {
      despachoId,
      procesoPlataformaId: procesoPlataforma.id,
      claveDeduplicacion: `clave-${sufijo}`,
      fechaActuacion: new Date('2024-03-01'),
      fechaRegistro: new Date('2024-03-04'),
      descripcion: 'Auto admite demanda',
      tieneDocumentos: true,
    },
  });
  const documento = await prisma.documento.create({
    data: { despachoId, actuacionId: actuacion.id, nombre: 'auto.pdf' },
  });
  const credencial = await prisma.credencialPlataforma.create({
    data: {
      despachoId,
      membresiaId: membresia.id,
      plataforma: 'SIUGJ',
      alcance: 'PERSONAL',
      usuario: `usuario-${sufijo}`,
      secretoCifrado: new Uint8Array([1, 2, 3]),
      consentimientoEn: new Date(),
    },
  });
  const consultaMasiva = await prisma.consultaMasiva.create({
    data: { despachoId, creadaPorId: membresia.id, totalItems: 1 },
  });
  await prisma.itemConsultaMasiva.create({
    data: {
      despachoId,
      consultaMasivaId: consultaMasiva.id,
      tipoIdentificador: 'RADICADO',
      identificador: radicado,
      plataforma: 'RAMA_CPNU',
    },
  });
  const preferencia = await prisma.preferenciaNotificacion.create({
    data: { despachoId, membresiaId: membresia.id },
  });
  const notificacion = await prisma.notificacion.create({
    data: { despachoId, membresiaId: membresia.id, actuacionId: actuacion.id, canal: 'CORREO' },
  });
  const registro = await prisma.registroAuditoria.create({
    data: { despachoId, actorId: usuario.id, accion: 'PROCESO_CREADO' },
  });

  return {
    despachoId,
    usuarioId: usuario.id,
    membresiaId: membresia.id,
    procesoId: proceso.id,
    radicado,
    asignacionId: asignacion.id,
    etiquetaId: etiqueta.id,
    procesoPlataformaId: procesoPlataforma.id,
    actuacionId: actuacion.id,
    documentoId: documento.id,
    credencialId: credencial.id,
    consultaMasivaId: consultaMasiva.id,
    preferenciaId: preferencia.id,
    notificacionId: notificacion.id,
    registroAuditoriaId: registro.id,
  };
}
