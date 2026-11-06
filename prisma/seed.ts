/**
 * Semilla de DESARROLLO: un despacho, un usuario por rol y procesos de ejemplo.
 * Todos los datos son ficticios. Es idempotente: se puede ejecutar varias veces.
 *
 *   pnpm db:seed
 *
 * Los datos de negocio se crean con el cliente aislado del despacho, igual que en la app.
 */
import { obtenerDependencias } from '@/composition-root';
import type { CodigoPlataforma, TipoAsignacion } from '@/generated/prisma/client';
import type { RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { crearNunc } from '@/shared/domain/nunc';
import { crearRadicado } from '@/shared/domain/radicado';
import type { Result } from '@/shared/domain/result';

const { env, logger, baseDeDatos } = obtenerDependencias('cli');

if (env.NODE_ENV === 'production') {
  throw new Error('La semilla de desarrollo no se ejecuta en producción.');
}

const prisma = baseDeDatos.sinAislamiento;

const DESPACHO = { nombre: 'Despacho Demo LURIS', slug: 'despacho-demo', nit: '9009009001' };

const USUARIOS = {
  superadmin: { nombre: 'Operador LURIS', email: 'superadmin@luris.test' },
  administradora: { nombre: 'Laura Gómez', email: 'administradora@despacho-demo.test' },
  abogado: { nombre: 'Carlos Rincón', email: 'abogado@despacho-demo.test' },
  abogada: { nombre: 'Mariana Ortiz', email: 'abogada@despacho-demo.test' },
  asistente: { nombre: 'Paula Méndez', email: 'asistente@despacho-demo.test' },
} as const;

type ClaveUsuario = keyof typeof USUARIOS;

const MEMBRESIAS: readonly { usuario: ClaveUsuario; rol: RolDeDespacho }[] = [
  { usuario: 'administradora', rol: 'administrador' },
  { usuario: 'abogado', rol: 'abogado' },
  { usuario: 'abogada', rol: 'abogado' },
  { usuario: 'asistente', rol: 'asistente' },
];

const ETIQUETAS = [
  { nombre: 'Civil', color: 'azul' },
  { nombre: 'Laboral', color: 'verde' },
  { nombre: 'Urgente', color: 'rojo' },
] as const;

type NombreEtiqueta = (typeof ETIQUETAS)[number]['nombre'];

interface ProcesoDeEjemplo {
  /** Escritos con guiones a propósito: la semilla los normaliza con los value objects. */
  readonly radicado?: string;
  readonly nunc?: string;
  readonly alias: string;
  readonly cliente: string;
  readonly activo?: boolean;
  readonly asignaciones: readonly { usuario: ClaveUsuario; tipo: TipoAsignacion }[];
  readonly etiquetas: readonly NombreEtiqueta[];
  readonly plataformas: readonly CodigoPlataforma[];
  readonly actuaciones?: readonly ActuacionDeEjemplo[];
}

interface ActuacionDeEjemplo {
  readonly clave: string;
  /** Fechas oficiales (las de la plataforma), formato AAAA-MM-DD. */
  readonly fechaActuacion: string;
  readonly fechaRegistro: string;
  readonly descripcion: string;
  readonly anotacion?: string;
  readonly tieneDocumentos?: boolean;
}

const PROCESOS: readonly ProcesoDeEjemplo[] = [
  {
    radicado: '11001-31-03-001-2023-00123-00',
    alias: 'Restitución de inmueble arrendado',
    cliente: 'Inversiones El Prado S.A.S.',
    asignaciones: [
      { usuario: 'abogado', tipo: 'RESPONSABLE' },
      { usuario: 'asistente', tipo: 'ASIGNADO' },
    ],
    etiquetas: ['Civil'],
    plataformas: ['RAMA_CPNU'],
    actuaciones: [
      {
        clave: 'demo-radicacion',
        fechaActuacion: '2023-02-15',
        fechaRegistro: '2023-02-16',
        descripcion: 'Radicación de proceso',
        anotacion: 'Reparto al Juzgado 1 Civil del Circuito de Bogotá.',
      },
      {
        clave: 'demo-admite',
        fechaActuacion: '2023-03-10',
        fechaRegistro: '2023-03-13',
        descripcion: 'Auto admite demanda',
        anotacion: 'Se admite la demanda y se ordena notificar a la parte demandada.',
        tieneDocumentos: true,
      },
      {
        clave: 'demo-estado',
        fechaActuacion: '2024-01-22',
        fechaRegistro: '2024-01-22',
        descripcion: 'Fijación estado',
        anotacion: 'Estado No. 8.',
      },
    ],
  },
  {
    radicado: '05001-31-05-002-2024-00045-00',
    alias: 'Ordinario laboral — reintegro',
    cliente: 'Jorge Pérez',
    asignaciones: [{ usuario: 'abogada', tipo: 'RESPONSABLE' }],
    etiquetas: ['Laboral', 'Urgente'],
    plataformas: ['RAMA_CPNU'],
  },
  {
    radicado: '76001-40-03-003-2022-00789-00',
    alias: 'Ejecutivo singular',
    cliente: 'Cooperativa Valle Unido',
    asignaciones: [{ usuario: 'abogado', tipo: 'RESPONSABLE' }],
    etiquetas: ['Civil'],
    plataformas: ['RAMA_CPNU', 'TYBA'],
  },
  {
    radicado: '11001-33-35-020-2023-00156-00',
    alias: 'Nulidad y restablecimiento del derecho',
    cliente: 'María Fernanda Ruiz',
    asignaciones: [{ usuario: 'abogada', tipo: 'RESPONSABLE' }],
    etiquetas: [],
    plataformas: ['SAMAI'],
  },
  {
    nunc: '11001-60-00049-2023-00123',
    alias: 'Denuncia por estafa',
    cliente: 'Comercializadora Andina Ltda.',
    asignaciones: [
      { usuario: 'abogado', tipo: 'RESPONSABLE' },
      { usuario: 'asistente', tipo: 'ASIGNADO' },
    ],
    etiquetas: ['Urgente'],
    plataformas: ['SPOA'],
  },
  {
    radicado: '08001-31-03-004-2021-00334-00',
    alias: 'Responsabilidad civil extracontractual (archivado)',
    cliente: 'Transportes del Caribe S.A.',
    activo: false,
    asignaciones: [],
    etiquetas: ['Civil'],
    plataformas: ['RAMA_CPNU'],
  },
];

function exigir<T>(resultado: Result<T, { mensajeUsuario: string }>, contexto: string): T {
  if (!resultado.ok) throw new Error(`${contexto}: ${resultado.error.mensajeUsuario}`);
  return resultado.value;
}

async function sembrar(): Promise<void> {
  // ─── Entidades globales (sin aislamiento: las crea la plataforma) ───
  const despacho = await prisma.despacho.upsert({
    where: { slug: DESPACHO.slug },
    create: DESPACHO,
    update: { nombre: DESPACHO.nombre, nit: DESPACHO.nit },
  });
  const despachoId = despacho.id;

  const usuarioIds = {} as Record<ClaveUsuario, string>;
  for (const [clave, datos] of Object.entries(USUARIOS) as [
    ClaveUsuario,
    (typeof USUARIOS)[ClaveUsuario],
  ][]) {
    const esSuperadmin = clave === 'superadmin';
    const usuario = await prisma.usuario.upsert({
      where: { email: datos.email },
      create: { ...datos, emailVerificado: true, esSuperadmin },
      update: { nombre: datos.nombre, esSuperadmin },
    });
    usuarioIds[clave] = usuario.id;
  }

  // ─── Datos del despacho (con el cliente aislado, como en la app) ───
  const db = baseDeDatos.paraDespacho(despachoId);

  const membresiaIds = {} as Record<ClaveUsuario, string>;
  for (const { usuario, rol } of MEMBRESIAS) {
    const usuarioId = usuarioIds[usuario];
    const membresia = await db.membresia.upsert({
      where: { despachoId_usuarioId: { despachoId, usuarioId } },
      create: { despachoId, usuarioId, rol },
      update: { rol, activa: true },
    });
    membresiaIds[usuario] = membresia.id;

    await db.preferenciaNotificacion.upsert({
      where: { membresiaId_despachoId: { membresiaId: membresia.id, despachoId } },
      create: { despachoId, membresiaId: membresia.id },
      update: {},
    });
  }

  const etiquetaIds = {} as Record<NombreEtiqueta, string>;
  for (const { nombre, color } of ETIQUETAS) {
    const etiqueta = await db.etiqueta.upsert({
      where: { despachoId_nombre: { despachoId, nombre } },
      create: { despachoId, nombre, color },
      update: { color },
    });
    etiquetaIds[nombre] = etiqueta.id;
  }

  for (const ejemplo of PROCESOS) {
    const radicado = ejemplo.radicado
      ? exigir(crearRadicado(ejemplo.radicado), ejemplo.alias)
      : null;
    const nunc = ejemplo.nunc ? exigir(crearNunc(ejemplo.nunc), ejemplo.alias) : null;
    const datos = {
      alias: ejemplo.alias,
      cliente: ejemplo.cliente,
      activo: ejemplo.activo ?? true,
    };

    const proceso = radicado
      ? await db.proceso.upsert({
          where: { despachoId_radicado: { despachoId, radicado } },
          create: { despachoId, radicado, nunc, ...datos },
          update: datos,
        })
      : await db.proceso.upsert({
          where: { despachoId_nunc: { despachoId, nunc: nunc as string } },
          create: { despachoId, nunc, ...datos },
          update: datos,
        });

    for (const { usuario, tipo } of ejemplo.asignaciones) {
      const membresiaId = membresiaIds[usuario];
      await db.asignacionProceso.upsert({
        where: { procesoId_membresiaId: { procesoId: proceso.id, membresiaId } },
        create: { despachoId, procesoId: proceso.id, membresiaId, tipo },
        update: { tipo },
      });
    }

    for (const nombre of ejemplo.etiquetas) {
      const etiquetaId = etiquetaIds[nombre];
      await db.etiquetaProceso.upsert({
        where: { procesoId_etiquetaId: { procesoId: proceso.id, etiquetaId } },
        create: { despachoId, procesoId: proceso.id, etiquetaId },
        update: {},
      });
    }

    for (const plataforma of ejemplo.plataformas) {
      const procesoPlataforma = await db.procesoPlataforma.upsert({
        where: { procesoId_plataforma: { procesoId: proceso.id, plataforma } },
        create: { despachoId, procesoId: proceso.id, plataforma },
        update: {},
      });

      if (plataforma !== 'RAMA_CPNU') continue;
      for (const actuacion of ejemplo.actuaciones ?? []) {
        const datosActuacion = {
          fechaActuacion: new Date(actuacion.fechaActuacion),
          fechaRegistro: new Date(actuacion.fechaRegistro),
          descripcion: actuacion.descripcion,
          anotacion: actuacion.anotacion ?? null,
          tieneDocumentos: actuacion.tieneDocumentos ?? false,
        };
        await db.actuacion.upsert({
          where: {
            procesoPlataformaId_claveDeduplicacion: {
              procesoPlataformaId: procesoPlataforma.id,
              claveDeduplicacion: actuacion.clave,
            },
          },
          create: {
            despachoId,
            procesoPlataformaId: procesoPlataforma.id,
            claveDeduplicacion: actuacion.clave,
            ...datosActuacion,
          },
          update: datosActuacion,
        });
      }
    }
  }

  await db.registroAuditoria.create({
    data: { despachoId, actorId: usuarioIds.administradora, accion: 'SEMILLA_APLICADA' },
  });

  logger.info('Semilla de desarrollo aplicada', {
    despacho: DESPACHO.slug,
    usuarios: Object.values(USUARIOS).map((u) => u.email),
    procesos: PROCESOS.length,
  });
}

try {
  await sembrar();
} catch (error) {
  logger.error('La semilla de desarrollo falló', { error });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
