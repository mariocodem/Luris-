import type { PrismaClient } from '@/generated/prisma/client';
import {
  CAMPOS_EDITABLES,
  CLASIFICACION,
  RELACIONES,
  type Clasificacion,
  type Modelo,
} from './modelo-de-datos';

/**
 * Aislamiento multi-despacho (§4 de CLAUDE.md).
 *
 * `crearClienteDeDespacho` devuelve un cliente de Prisma que, en cada operación:
 * 1. Filtra por el despacho de la sesión (lecturas, actualizaciones y borrados).
 * 2. Inyecta el `despachoId` al crear y rechaza cambiarlo.
 * 3. Rechaza escrituras anidadas (crear/conectar relaciones dentro de `data`): los repositorios
 *    usan claves foráneas escalares. Así nadie puede "conectar" un registro de otro despacho.
 * 4. Impide navegar desde un Usuario (global) hacia sus relaciones, que llevarían a otros despachos.
 * 5. Rechaza modelos u operaciones desconocidas y las consultas SQL crudas (falla cerrado).
 *
 * Defensa en profundidad: las claves foráneas compuestas (padreId, despachoId) del esquema hacen
 * que la base de datos rechace cualquier relación entre registros de despachos distintos.
 */

/** Uso indebido del cliente de un despacho. Es un error de programación, no un error esperable. */
export class ErrorDeAislamiento extends Error {
  override readonly name = 'ErrorDeAislamiento';
}

type Args = Record<string, unknown>;

const LECTURAS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const ACTUALIZACIONES = new Set(['update', 'updateMany', 'updateManyAndReturn']);
const BORRADOS = new Set(['delete', 'deleteMany']);
const CREACIONES = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPSERT = 'upsert';

const OPERACIONES_PERMITIDAS: Readonly<Record<Clasificacion, ReadonlySet<string>>> = {
  NEGOCIO: new Set([...LECTURAS, ...ACTUALIZACIONES, ...BORRADOS, ...CREACIONES, UPSERT]),
  NEGOCIO_SOLO_AGREGAR: new Set([...LECTURAS, ...CREACIONES]),
  DESPACHO_PROPIO: new Set([...LECTURAS, ...ACTUALIZACIONES]),
  USUARIO_DEL_DESPACHO: new Set([...LECTURAS, ...ACTUALIZACIONES]),
};

/** Claves de los argumentos de Prisma que contienen estructura del mismo modelo. */
const CLAVES_ESTRUCTURALES = new Set([
  'select',
  'include',
  'where',
  'orderBy',
  'cursor',
  'having',
  'AND',
  'OR',
  'NOT',
  'some',
  'every',
  'none',
  'is',
  'isNot',
  '_count',
]);

const ARGUMENTOS_NAVEGABLES = ['where', 'select', 'include', 'orderBy', 'cursor', 'having'];

/**
 * Devuelve una copia de `args` con el alcance del despacho aplicado, o lanza
 * `ErrorDeAislamiento` si la operación no está permitida en el cliente de un despacho.
 */
export function aplicarAlcanceDeDespacho(
  modelo: string,
  operacion: string,
  args: unknown,
  despachoId: string,
): Args {
  if (!esModelo(modelo)) throw new ErrorDeAislamiento(`Modelo sin clasificar: ${modelo}`);
  const clasificacion = CLASIFICACION[modelo];
  if (!OPERACIONES_PERMITIDAS[clasificacion].has(operacion)) {
    throw new ErrorDeAislamiento(`Operación no permitida en ${modelo}: ${operacion}`);
  }

  const original: Args = esObjetoPlano(args) ? args : {};
  for (const clave of ARGUMENTOS_NAVEGABLES) {
    if (clave in original) verificarNavegacion(modelo, original[clave], `${modelo}.${clave}`);
  }

  const resultado: Args = { ...original };
  if (operacion !== 'create' && !CREACIONES.has(operacion)) {
    resultado.where = agregarFiltro(original.where, filtroDeAlcance(clasificacion, despachoId));
  }

  if (operacion === 'create') {
    resultado.data = prepararCreacion(modelo, original.data, despachoId);
  } else if (operacion === 'createMany' || operacion === 'createManyAndReturn') {
    resultado.data = Array.isArray(original.data)
      ? original.data.map((fila) => prepararCreacion(modelo, fila, despachoId))
      : prepararCreacion(modelo, original.data, despachoId);
  } else if (ACTUALIZACIONES.has(operacion)) {
    resultado.data = verificarActualizacion(modelo, clasificacion, original.data, despachoId);
  } else if (operacion === UPSERT) {
    resultado.create = prepararCreacion(modelo, original.create, despachoId);
    resultado.update = verificarActualizacion(modelo, clasificacion, original.update, despachoId);
  }

  return resultado;
}

function filtroDeAlcance(clasificacion: Clasificacion, despachoId: string): Args {
  switch (clasificacion) {
    case 'NEGOCIO':
    case 'NEGOCIO_SOLO_AGREGAR':
      return { despachoId };
    case 'DESPACHO_PROPIO':
      return { id: despachoId };
    case 'USUARIO_DEL_DESPACHO':
      return { membresias: { some: { despachoId } } };
  }
}

/**
 * Agrega el filtro con AND, sin reemplazar condiciones existentes: si la consulta pide otro
 * despacho, el resultado es vacío (no se "corrige" en silencio hacia el propio).
 * Prisma admite AND junto a los campos únicos en `findUnique`, `update`, `delete` y `upsert`.
 */
function agregarFiltro(where: unknown, filtro: Args): Args {
  const base: Args = esObjetoPlano(where) ? where : {};
  const previos = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...previos, filtro] };
}

function prepararCreacion(modelo: Modelo, data: unknown, despachoId: string): Args {
  const fila = exigirObjeto(modelo, data);
  rechazarEscriturasAnidadas(modelo, fila);
  if ('despachoId' in fila && fila.despachoId !== despachoId) {
    throw new ErrorDeAislamiento(`Intento de crear ${modelo} en otro despacho`);
  }
  return { ...fila, despachoId };
}

function verificarActualizacion(
  modelo: Modelo,
  clasificacion: Clasificacion,
  data: unknown,
  despachoId: string,
): Args {
  const cambios = exigirObjeto(modelo, data);
  rechazarEscriturasAnidadas(modelo, cambios);

  const editables = CAMPOS_EDITABLES[modelo];
  if (clasificacion === 'DESPACHO_PROPIO' || clasificacion === 'USUARIO_DEL_DESPACHO') {
    const prohibidos = Object.keys(cambios).filter((campo) => !editables?.has(campo));
    if (prohibidos.length > 0) {
      throw new ErrorDeAislamiento(`Campos no editables en ${modelo}: ${prohibidos.join(', ')}`);
    }
  }
  if ('despachoId' in cambios && cambios.despachoId !== despachoId) {
    throw new ErrorDeAislamiento(`Intento de mover ${modelo} a otro despacho`);
  }
  return cambios;
}

function rechazarEscriturasAnidadas(modelo: Modelo, data: Args): void {
  const relaciones: Readonly<Record<string, Modelo>> = RELACIONES[modelo];
  const anidadas = Object.keys(data).filter((campo) => campo in relaciones);
  if (anidadas.length > 0) {
    throw new ErrorDeAislamiento(
      `Escritura anidada no permitida en ${modelo}: ${anidadas.join(', ')}. Usa claves foráneas escalares.`,
    );
  }
}

/**
 * Recorre select/include/where/orderBy siguiendo las relaciones. Desde un Usuario no se permite
 * navegar a ninguna relación (ni contarlas): sus membresías llevan a otros despachos.
 */
function verificarNavegacion(modelo: Modelo, nodo: unknown, ruta: string): void {
  if (Array.isArray(nodo)) {
    nodo.forEach((elemento, i) => verificarNavegacion(modelo, elemento, `${ruta}[${i}]`));
    return;
  }
  if (!esObjetoPlano(nodo)) return;

  const relaciones: Readonly<Record<string, Modelo>> = RELACIONES[modelo];
  for (const [clave, valor] of Object.entries(nodo)) {
    const destino = relaciones[clave];
    if (
      modelo === 'Usuario' &&
      (destino !== undefined || clave === 'include' || clave === '_count')
    ) {
      throw new ErrorDeAislamiento(`Navegación no permitida desde Usuario: ${ruta}.${clave}`);
    }
    if (destino !== undefined) verificarNavegacion(destino, valor, `${ruta}.${clave}`);
    else if (CLAVES_ESTRUCTURALES.has(clave))
      verificarNavegacion(modelo, valor, `${ruta}.${clave}`);
  }
}

function exigirObjeto(modelo: Modelo, valor: unknown): Args {
  if (!esObjetoPlano(valor)) throw new ErrorDeAislamiento(`Datos inválidos para ${modelo}`);
  return valor;
}

function esModelo(valor: string): valor is Modelo {
  return Object.hasOwn(CLASIFICACION, valor);
}

function esObjetoPlano(valor: unknown): valor is Args {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo: unknown = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cliente de Prisma limitado a un despacho. Es la ÚNICA vía para leer o escribir datos de
 * negocio. `despachoId` debe venir de la sesión validada, nunca de la entrada del usuario.
 */
export function crearClienteDeDespacho(prisma: PrismaClient, despachoId: string) {
  if (!FORMATO_UUID.test(despachoId)) {
    throw new ErrorDeAislamiento('El despachoId del cliente debe ser un UUID');
  }
  return prisma.$extends({
    name: 'aislamiento-por-despacho',
    query: {
      $allOperations({ model, operation, args, query }) {
        if (model === undefined) {
          throw new ErrorDeAislamiento(`Consulta cruda no permitida: ${operation}`);
        }
        return query(aplicarAlcanceDeDespacho(model, operation, args, despachoId) as typeof args);
      },
    },
  });
}

export type ClienteDeDespacho = ReturnType<typeof crearClienteDeDespacho>;
