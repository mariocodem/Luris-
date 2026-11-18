import type { Prisma } from '@/generated/prisma/client';
import { tipoPorMime } from '@/modules/documentos/domain/tipo-de-archivo';
import { leerDatosGuardados } from '@/modules/plataformas/infrastructure/datos-de-proceso';
import { esRolDeDespacho, type RolDeDespacho } from '@/modules/usuarios/domain/rol-de-despacho';
import { err, ok } from '@/shared/domain/result';
import type { ClienteDeDespacho } from '@/shared/infrastructure/prisma/aislamiento-despacho';
import {
  claveDeEtiqueta,
  normalizarParaBusqueda,
  textoDeBusqueda,
  unificarEtiquetas,
  type Asignacion,
} from '../domain/proceso';
import {
  ACTUACIONES_EN_LA_FICHA,
  DIAS_COMO_NUEVA,
  PROCESOS_POR_PAGINA,
  type DirectorioDelDespacho,
  type FiltrosDeProcesos,
  type AlcanceDeLista,
  type NuevoProceso,
  type RepositorioDeProcesos,
  type ResumenDeProceso,
} from '../application/puertos';

/**
 * Procesos sobre Prisma. TODO pasa por el cliente aislado del despacho (filtra e inyecta el
 * `despachoId`); nunca por el cliente sin aislamiento. Se usan claves foráneas escalares.
 */
type ParaDespacho = (despachoId: string) => ClienteDeDespacho;
type Transaccion = Parameters<Parameters<ClienteDeDespacho['$transaction']>[0]>[0];

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esViolacionDeUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function rol(valor: string): RolDeDespacho {
  // La restricción CHECK de la base garantiza el valor; esto protege ante datos inesperados.
  if (!esRolDeDespacho(valor)) throw new Error(`Rol desconocido en la base: ${valor}`);
  return valor;
}

/** Condiciones de la lista según filtros y alcance (participante o todo el despacho). */
function condicionesDeLista(
  filtros: FiltrosDeProcesos,
  alcance: AlcanceDeLista,
): Prisma.ProcesoWhereInput[] {
  const condiciones: Prisma.ProcesoWhereInput[] = [];
  if (filtros.estado === 'activos') condiciones.push({ activo: true });
  if (filtros.estado === 'archivados') condiciones.push({ activo: false });
  if (alcance.tipo === 'PARTICIPANTE') {
    condiciones.push({ asignaciones: { some: { membresiaId: alcance.membresiaId } } });
  }
  if (filtros.etiquetaId)
    condiciones.push({ etiquetas: { some: { etiquetaId: filtros.etiquetaId } } });
  if (filtros.responsable === 'ninguno') {
    condiciones.push({ asignaciones: { none: { tipo: 'RESPONSABLE' } } });
  } else if (filtros.responsable) {
    condiciones.push({
      asignaciones: { some: { membresiaId: filtros.responsable, tipo: 'RESPONSABLE' } },
    });
  }

  const texto = filtros.texto?.trim();
  if (texto) {
    const opciones: Prisma.ProcesoWhereInput[] = [
      { busqueda: { contains: normalizarParaBusqueda(texto) } },
    ];
    // Un fragmento de radicado o NUNC, con o sin guiones (al menos 4 cifras para no saturar).
    const digitos = texto.replace(/\D/g, '');
    if (digitos.length >= 4) {
      opciones.push({ radicado: { contains: digitos } }, { nunc: { contains: digitos } });
    }
    condiciones.push({ OR: opciones });
  }
  return condiciones;
}

const ORDEN: Readonly<
  Record<FiltrosDeProcesos['orden'], Prisma.ProcesoOrderByWithRelationInput[]>
> = {
  recientes: [{ creadoEn: 'desc' }, { id: 'desc' }],
  alias: [{ alias: { sort: 'asc', nulls: 'last' } }, { radicado: 'asc' }, { id: 'asc' }],
};

/**
 * Crea las etiquetas que falten (sin distinguir mayúsculas ni tildes). Devuelve el id de cada
 * etiqueta por su clave normalizada: «Civil» y «civil» apuntan a la misma.
 */
async function asegurarEtiquetas(
  tx: Transaccion,
  despachoId: string,
  nombres: readonly string[],
): Promise<Map<string, string>> {
  const idPorClave = new Map<string, string>();
  if (nombres.length === 0) return idPorClave;
  const cargar = async () => {
    for (const e of await tx.etiqueta.findMany({ select: { id: true, nombre: true } })) {
      idPorClave.set(claveDeEtiqueta(e.nombre), e.id);
    }
  };
  await cargar();
  // Una sola fila por etiqueta aunque llegue escrita de varias formas («URGENTE», «Urgente»).
  const faltantes = unificarEtiquetas(nombres).filter((n) => !idPorClave.has(claveDeEtiqueta(n)));
  if (faltantes.length > 0) {
    await tx.etiqueta.createMany({
      data: faltantes.map((nombre) => ({ despachoId, nombre })),
      skipDuplicates: true,
    });
    await cargar();
  }
  return idPorClave;
}

/** Ids (sin repetir) de las etiquetas con esos nombres. */
function idsDeEtiquetas(
  idPorClave: ReadonlyMap<string, string>,
  nombres: readonly string[],
): string[] {
  const ids = nombres.map((nombre) => idPorClave.get(claveDeEtiqueta(nombre)));
  return [...new Set(ids)].filter((id): id is string => id !== undefined);
}

function datosDeFila(despachoId: string, nuevo: NuevoProceso) {
  return {
    despachoId,
    radicado: nuevo.radicado,
    nunc: nuevo.nunc,
    alias: nuevo.alias,
    cliente: nuevo.cliente,
    busqueda: textoDeBusqueda(nuevo),
  };
}

async function vincular(
  tx: Transaccion,
  despachoId: string,
  procesoId: string,
  etiquetaIds: readonly string[],
  asignaciones: readonly Asignacion[],
): Promise<void> {
  if (etiquetaIds.length > 0) {
    await tx.etiquetaProceso.createMany({
      data: etiquetaIds.map((etiquetaId) => ({ despachoId, procesoId, etiquetaId })),
      skipDuplicates: true,
    });
  }
  if (asignaciones.length > 0) {
    await tx.asignacionProceso.createMany({
      data: asignaciones.map((a) => ({
        despachoId,
        procesoId,
        membresiaId: a.membresiaId,
        tipo: a.tipo,
      })),
    });
  }
}

export function crearRepositorioDeProcesos(paraDespacho: ParaDespacho): RepositorioDeProcesos {
  return {
    async listar(despachoId, filtros, alcance) {
      const db = paraDespacho(despachoId);
      const where: Prisma.ProcesoWhereInput = { AND: condicionesDeLista(filtros, alcance) };
      const pagina = Math.max(1, filtros.pagina);
      const [total, filas] = await db.$transaction([
        db.proceso.count({ where }),
        db.proceso.findMany({
          where,
          orderBy: ORDEN[filtros.orden],
          skip: (pagina - 1) * PROCESOS_POR_PAGINA,
          take: PROCESOS_POR_PAGINA,
          select: {
            id: true,
            radicado: true,
            nunc: true,
            alias: true,
            cliente: true,
            activo: true,
            creadoEn: true,
            etiquetas: {
              select: { etiqueta: { select: { nombre: true } } },
              orderBy: { etiqueta: { nombre: 'asc' } },
            },
            asignaciones: {
              where: { tipo: 'RESPONSABLE' },
              take: 1,
              select: {
                membresiaId: true,
                membresia: { select: { usuario: { select: { nombre: true } } } },
              },
            },
            plataformas: {
              select: {
                actuaciones: {
                  select: { fechaActuacion: true },
                  orderBy: { fechaActuacion: 'desc' },
                  take: 1,
                },
              },
            },
          },
        }),
      ]);

      const procesos = filas.map((fila): ResumenDeProceso => {
        const responsable = fila.asignaciones[0];
        const fechas = fila.plataformas.flatMap((p) => p.actuaciones.map((a) => a.fechaActuacion));
        const ultima = fechas.reduce<Date | null>((max, f) => (!max || f > max ? f : max), null);
        return {
          id: fila.id,
          radicado: fila.radicado,
          nunc: fila.nunc,
          alias: fila.alias,
          cliente: fila.cliente,
          activo: fila.activo,
          creadoEn: fila.creadoEn,
          etiquetas: fila.etiquetas.map((e) => e.etiqueta.nombre),
          responsable: responsable
            ? { membresiaId: responsable.membresiaId, nombre: responsable.membresia.usuario.nombre }
            : null,
          ultimaActuacion: ultima,
        };
      });
      return { procesos, total, pagina, porPagina: PROCESOS_POR_PAGINA };
    },

    async buscar(despachoId, procesoId) {
      if (!FORMATO_UUID.test(procesoId)) return null;
      const db = paraDespacho(despachoId);
      const fila = await db.proceso.findUnique({
        where: { id: procesoId },
        select: {
          id: true,
          radicado: true,
          nunc: true,
          alias: true,
          cliente: true,
          activo: true,
          creadoEn: true,
          etiquetas: {
            select: { etiqueta: { select: { id: true, nombre: true } } },
            orderBy: { etiqueta: { nombre: 'asc' } },
          },
          asignaciones: {
            orderBy: [{ tipo: 'asc' }, { creadoEn: 'asc' }],
            select: {
              membresiaId: true,
              tipo: true,
              membresia: {
                select: { rol: true, activa: true, usuario: { select: { nombre: true } } },
              },
            },
          },
          plataformas: {
            orderBy: { plataforma: 'asc' },
            select: {
              plataforma: true,
              ultimaSincronizacionEn: true,
              ultimaConsultaEn: true,
              estadoUltimaConsulta: true,
              datosProceso: true,
            },
          },
        },
      });
      if (!fila) return null;

      const delProceso = { procesoPlataforma: { procesoId } };
      const desdeNuevas = new Date(Date.now() - DIAS_COMO_NUEVA * 24 * 60 * 60 * 1000);
      const [actuaciones, totalActuaciones] = await db.$transaction([
        db.actuacion.findMany({
          where: delProceso,
          orderBy: [{ fechaActuacion: 'desc' }, { fechaRegistro: 'desc' }, { detectadaEn: 'desc' }],
          take: ACTUACIONES_EN_LA_FICHA,
          select: {
            id: true,
            fechaActuacion: true,
            fechaRegistro: true,
            descripcion: true,
            anotacion: true,
            despachoJudicial: true,
            terminoInicia: true,
            terminoVence: true,
            tieneDocumentos: true,
            origen: true,
            cargaInicial: true,
            detectadaEn: true,
            procesoPlataforma: { select: { plataforma: true } },
            documentos: {
              orderBy: [{ fechaCarga: 'asc' }, { creadoEn: 'asc' }],
              select: { id: true, nombre: true, estado: true, fechaCarga: true, tipoMime: true },
            },
          },
        }),
        db.actuacion.count({ where: delProceso }),
      ]);

      return {
        id: fila.id,
        radicado: fila.radicado,
        nunc: fila.nunc,
        alias: fila.alias,
        cliente: fila.cliente,
        activo: fila.activo,
        creadoEn: fila.creadoEn,
        etiquetas: fila.etiquetas.map((e) => e.etiqueta),
        asignaciones: fila.asignaciones.map((a) => ({
          membresiaId: a.membresiaId,
          tipo: a.tipo,
          nombre: a.membresia.usuario.nombre,
          rol: rol(a.membresia.rol),
          activa: a.membresia.activa,
        })),
        plataformas: fila.plataformas.map(({ datosProceso, ...plataforma }) => ({
          ...plataforma,
          expedientes: leerDatosGuardados(datosProceso),
        })),
        actuaciones: actuaciones.map(
          ({ procesoPlataforma, cargaInicial, detectadaEn, documentos, ...actuacion }) => ({
            ...actuacion,
            plataforma: procesoPlataforma.plataforma,
            nueva: !cargaInicial && detectadaEn >= desdeNuevas,
            documentos: documentos.map(({ tipoMime, ...documento }) => ({
              ...documento,
              visibleEnLinea: tipoMime ? (tipoPorMime(tipoMime)?.visibleEnLinea ?? false) : false,
            })),
          }),
        ),
        totalActuaciones,
      };
    },

    async buscarPorIdentificadores(despachoId, { radicados, nuncs }) {
      if (radicados.length === 0 && nuncs.length === 0) return [];
      return paraDespacho(despachoId).proceso.findMany({
        where: {
          OR: [{ radicado: { in: [...radicados] } }, { nunc: { in: [...nuncs] } }],
        },
        select: { id: true, radicado: true, nunc: true },
      });
    },

    async registrar(despachoId, nuevo) {
      const db = paraDespacho(despachoId);
      try {
        const id = await db.$transaction(async (tx) => {
          const etiquetas = await asegurarEtiquetas(tx, despachoId, nuevo.etiquetas);
          const proceso = await tx.proceso.create({
            data: datosDeFila(despachoId, nuevo),
            select: { id: true },
          });
          const etiquetaIds = idsDeEtiquetas(etiquetas, nuevo.etiquetas);
          await vincular(tx, despachoId, proceso.id, etiquetaIds, nuevo.asignaciones);
          return proceso.id;
        });
        return ok({ id });
      } catch (error) {
        if (esViolacionDeUnicidad(error)) return err('DUPLICADO');
        throw error;
      }
    },

    async registrarVarios(despachoId, nuevos) {
      const db = paraDespacho(despachoId);
      return db.$transaction(
        async (tx) => {
          // Si otra persona registró alguno mientras tanto, se omite en silencio.
          const creados = await tx.proceso.createManyAndReturn({
            data: nuevos.map((n) => datosDeFila(despachoId, n)),
            skipDuplicates: true,
            select: { id: true, radicado: true, nunc: true },
          });

          const porRadicado = new Map<string, NuevoProceso>();
          const porNunc = new Map<string, NuevoProceso>();
          for (const n of nuevos) {
            if (n.radicado) porRadicado.set(n.radicado, n);
            if (n.nunc) porNunc.set(n.nunc, n);
          }
          const origenes = creados.flatMap((creado) => {
            const origen =
              (creado.radicado && porRadicado.get(creado.radicado)) ||
              (creado.nunc && porNunc.get(creado.nunc));
            return origen ? [{ procesoId: creado.id, origen }] : [];
          });
          // Solo las etiquetas de los procesos que sí se crearon.
          const idDeEtiqueta = await asegurarEtiquetas(
            tx,
            despachoId,
            origenes.flatMap(({ origen }) => origen.etiquetas),
          );

          const etiquetasProceso: Prisma.EtiquetaProcesoCreateManyInput[] = [];
          const asignaciones: Prisma.AsignacionProcesoCreateManyInput[] = [];
          for (const { procesoId, origen } of origenes) {
            for (const etiquetaId of idsDeEtiquetas(idDeEtiqueta, origen.etiquetas)) {
              etiquetasProceso.push({ despachoId, procesoId, etiquetaId });
            }
            for (const a of origen.asignaciones) {
              asignaciones.push({
                despachoId,
                procesoId,
                membresiaId: a.membresiaId,
                tipo: a.tipo,
              });
            }
          }
          if (etiquetasProceso.length > 0) {
            await tx.etiquetaProceso.createMany({ data: etiquetasProceso, skipDuplicates: true });
          }
          if (asignaciones.length > 0)
            await tx.asignacionProceso.createMany({ data: asignaciones });
          return creados.length;
        },
        { timeout: 30_000 },
      );
    },

    async actualizar(despachoId, procesoId, datos, { cambiaronIdentificadores }) {
      const db = paraDespacho(despachoId);
      try {
        await db.$transaction(async (tx) => {
          // El identificador anterior ya no aplica: sus registros de plataforma se descartan.
          if (cambiaronIdentificadores)
            await tx.procesoPlataforma.deleteMany({ where: { procesoId } });
          await tx.proceso.update({
            where: { id: procesoId },
            data: {
              radicado: datos.radicado,
              nunc: datos.nunc,
              alias: datos.alias,
              cliente: datos.cliente,
              busqueda: textoDeBusqueda(datos),
            },
          });
          const etiquetas = await asegurarEtiquetas(tx, despachoId, datos.etiquetas);
          const etiquetaIds = idsDeEtiquetas(etiquetas, datos.etiquetas);
          await tx.etiquetaProceso.deleteMany({
            where: { procesoId, etiquetaId: { notIn: etiquetaIds } },
          });
          await vincular(tx, despachoId, procesoId, etiquetaIds, []);
        });
        return ok(undefined);
      } catch (error) {
        if (esViolacionDeUnicidad(error)) return err('DUPLICADO');
        throw error;
      }
    },

    async cambiarActivo(despachoId, procesoId, activo) {
      await paraDespacho(despachoId).proceso.update({ where: { id: procesoId }, data: { activo } });
    },

    async establecerResponsable(despachoId, procesoId, membresiaId) {
      const db = paraDespacho(despachoId);
      await db.$transaction(async (tx) => {
        await tx.asignacionProceso.deleteMany({ where: { procesoId, tipo: 'RESPONSABLE' } });
        if (membresiaId === null) return;
        await tx.asignacionProceso.upsert({
          where: { procesoId_membresiaId: { procesoId, membresiaId } },
          create: { despachoId, procesoId, membresiaId, tipo: 'RESPONSABLE' },
          update: { tipo: 'RESPONSABLE' },
        });
      });
    },

    async agregarAsignado(despachoId, procesoId, membresiaId) {
      await paraDespacho(despachoId).asignacionProceso.upsert({
        where: { procesoId_membresiaId: { procesoId, membresiaId } },
        create: { despachoId, procesoId, membresiaId, tipo: 'ASIGNADO' },
        update: {},
      });
    },

    async quitarAsignado(despachoId, procesoId, membresiaId) {
      await paraDespacho(despachoId).asignacionProceso.deleteMany({
        where: { procesoId, membresiaId, tipo: 'ASIGNADO' },
      });
    },
  };
}

/** Personas y etiquetas del despacho. */
export function crearDirectorioDelDespacho(paraDespacho: ParaDespacho): DirectorioDelDespacho {
  return {
    async miembros(despachoId) {
      const filas = await paraDespacho(despachoId).membresia.findMany({
        select: { id: true, rol: true, activa: true, usuario: { select: { nombre: true } } },
        orderBy: { usuario: { nombre: 'asc' } },
      });
      return filas.map((f) => ({
        membresiaId: f.id,
        nombre: f.usuario.nombre,
        rol: rol(f.rol),
        activa: f.activa,
      }));
    },
    etiquetas: (despachoId) =>
      paraDespacho(despachoId).etiqueta.findMany({
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
  };
}
