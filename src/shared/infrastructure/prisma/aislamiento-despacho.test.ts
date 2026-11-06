import { describe, expect, it } from 'vitest';
import { aplicarAlcanceDeDespacho, ErrorDeAislamiento } from './aislamiento-despacho';
import { CLASIFICACION, RELACIONES, type Clasificacion, type Modelo } from './modelo-de-datos';

const DESPACHO = '01900000-0000-7000-8000-000000000001';
const OTRO = '01900000-0000-7000-8000-000000000002';

const aplicar = (modelo: string, operacion: string, args: unknown = {}) =>
  aplicarAlcanceDeDespacho(modelo, operacion, args, DESPACHO);

const OPERACIONES = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
] as const;

/** Argumentos mínimos válidos para cada operación. */
function argsPara(operacion: (typeof OPERACIONES)[number], datos: Record<string, unknown>) {
  if (operacion.startsWith('create')) return { data: datos };
  if (operacion === 'upsert') return { where: { id: 'x' }, create: datos, update: datos };
  if (operacion.startsWith('update')) return { where: {}, data: datos };
  return { where: {} };
}

const PERMITIDAS: Record<Clasificacion, readonly string[]> = {
  NEGOCIO: OPERACIONES,
  NEGOCIO_SOLO_AGREGAR: OPERACIONES.filter((o) => !/update|delete|upsert/.test(o)),
  DESPACHO_PROPIO: OPERACIONES.filter((o) => !/create|delete|upsert/.test(o)),
  USUARIO_DEL_DESPACHO: OPERACIONES.filter((o) => !/create|delete|upsert/.test(o)),
};

const EJEMPLO: Record<Clasificacion, { modelo: Modelo; datos: Record<string, unknown> }> = {
  NEGOCIO: { modelo: 'Proceso', datos: { alias: 'x' } },
  NEGOCIO_SOLO_AGREGAR: { modelo: 'RegistroAuditoria', datos: { accion: 'x' } },
  DESPACHO_PROPIO: { modelo: 'Despacho', datos: { nombre: 'x' } },
  USUARIO_DEL_DESPACHO: { modelo: 'Usuario', datos: { nombre: 'x' } },
};

describe('matriz de operaciones por clasificación', () => {
  const casos = (Object.keys(PERMITIDAS) as Clasificacion[]).flatMap((clasificacion) =>
    OPERACIONES.map((operacion) => ({
      clasificacion,
      operacion,
      permitida: PERMITIDAS[clasificacion].includes(operacion),
    })),
  );

  it.each(casos)(
    '$clasificacion · $operacion → permitida: $permitida',
    ({ clasificacion, operacion, permitida }) => {
      const { modelo, datos } = EJEMPLO[clasificacion];
      const ejecutar = () => aplicar(modelo, operacion, argsPara(operacion, datos));
      if (permitida) expect(ejecutar).not.toThrow();
      else expect(ejecutar).toThrow(ErrorDeAislamiento);
    },
  );

  it('rechaza modelos u operaciones desconocidas (falla cerrado)', () => {
    expect(() => aplicar('ModeloInventado', 'findMany')).toThrow(ErrorDeAislamiento);
    expect(() => aplicar('Proceso', 'operacionInventada')).toThrow(ErrorDeAislamiento);
  });
});

describe('filtro de lectura, actualización y borrado', () => {
  it.each([
    'findMany',
    'findUnique',
    'count',
    'aggregate',
    'groupBy',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
  ])('%s agrega el despacho con AND', (operacion) => {
    const args = operacion.startsWith('update')
      ? { where: { id: 'p1' }, data: { alias: 'x' } }
      : { where: { id: 'p1' } };
    expect(aplicar('Proceso', operacion, args).where).toEqual({
      id: 'p1',
      AND: [{ despachoId: DESPACHO }],
    });
  });

  it('funciona sin where', () => {
    expect(aplicar('Proceso', 'findMany').where).toEqual({ AND: [{ despachoId: DESPACHO }] });
  });

  it('conserva un AND existente, sea arreglo u objeto', () => {
    expect(aplicar('Proceso', 'findMany', { where: { AND: [{ activo: true }] } }).where).toEqual({
      AND: [{ activo: true }, { despachoId: DESPACHO }],
    });
    expect(aplicar('Proceso', 'findMany', { where: { AND: { activo: true } } }).where).toEqual({
      AND: [{ activo: true }, { despachoId: DESPACHO }],
    });
  });

  it('no reemplaza un despachoId pedido explícitamente: lo combina (resultado vacío si es otro)', () => {
    expect(aplicar('Proceso', 'findMany', { where: { despachoId: OTRO } }).where).toEqual({
      despachoId: OTRO,
      AND: [{ despachoId: DESPACHO }],
    });
  });

  it('filtra el propio despacho por id y a los usuarios por membresía', () => {
    expect(aplicar('Despacho', 'findMany').where).toEqual({ AND: [{ id: DESPACHO }] });
    expect(aplicar('Usuario', 'findMany').where).toEqual({
      AND: [{ membresias: { some: { despachoId: DESPACHO } } }],
    });
  });

  it('no modifica los argumentos originales', () => {
    const args = { where: { id: 'p1' } };
    aplicar('Proceso', 'findMany', args);
    expect(args).toEqual({ where: { id: 'p1' } });
  });
});

describe('creación', () => {
  it('inyecta el despacho en create, createMany y upsert', () => {
    expect(aplicar('Proceso', 'create', { data: { radicado: '1' } }).data).toEqual({
      radicado: '1',
      despachoId: DESPACHO,
    });
    expect(
      aplicar('Etiqueta', 'createMany', { data: [{ nombre: 'a' }, { nombre: 'b' }] }).data,
    ).toEqual([
      { nombre: 'a', despachoId: DESPACHO },
      { nombre: 'b', despachoId: DESPACHO },
    ]);
    const upsert = aplicar('Etiqueta', 'upsert', {
      where: { id: 'e' },
      create: { nombre: 'a' },
      update: {},
    });
    expect(upsert.create).toEqual({ nombre: 'a', despachoId: DESPACHO });
    expect(upsert.where).toEqual({ id: 'e', AND: [{ despachoId: DESPACHO }] });
  });

  it('acepta un despachoId explícito igual al de la sesión', () => {
    expect(
      aplicar('Proceso', 'create', { data: { despachoId: DESPACHO, radicado: '1' } }).data,
    ).toEqual({
      despachoId: DESPACHO,
      radicado: '1',
    });
  });

  it.each(['create', 'createMany'])('%s rechaza otro despacho', (operacion) => {
    expect(() => aplicar('Proceso', operacion, { data: { despachoId: OTRO } })).toThrow(
      ErrorDeAislamiento,
    );
  });

  it('rechaza datos que no son un objeto', () => {
    expect(() => aplicar('Proceso', 'create', { data: null })).toThrow(ErrorDeAislamiento);
    expect(() => aplicar('Proceso', 'update', { where: {} })).toThrow(ErrorDeAislamiento);
  });
});

describe('actualización', () => {
  it('rechaza mover un registro a otro despacho (también con { set })', () => {
    expect(() => aplicar('Proceso', 'update', { where: {}, data: { despachoId: OTRO } })).toThrow(
      ErrorDeAislamiento,
    );
    expect(() =>
      aplicar('Proceso', 'update', { where: {}, data: { despachoId: { set: OTRO } } }),
    ).toThrow(ErrorDeAislamiento);
    expect(() =>
      aplicar('Etiqueta', 'upsert', { where: {}, create: {}, update: { despachoId: OTRO } }),
    ).toThrow(ErrorDeAislamiento);
  });

  it('en modelos globales solo admite los campos editables', () => {
    expect(() =>
      aplicar('Despacho', 'update', { where: {}, data: { nombre: 'Nuevo', nit: '900' } }),
    ).not.toThrow();
    expect(() =>
      aplicar('Usuario', 'update', { where: {}, data: { nombre: 'N', imagen: null } }),
    ).not.toThrow();
    for (const campo of ['estado', 'plan', 'slug', 'id']) {
      expect(() => aplicar('Despacho', 'update', { where: {}, data: { [campo]: 'x' } })).toThrow(
        ErrorDeAislamiento,
      );
    }
    for (const campo of ['email', 'esSuperadmin', 'emailVerificado', 'id']) {
      expect(() => aplicar('Usuario', 'updateMany', { data: { [campo]: true } })).toThrow(
        ErrorDeAislamiento,
      );
    }
  });
});

describe('escrituras anidadas', () => {
  it.each([
    ['create', { data: { plataformas: { create: {} } } }],
    ['update', { where: {}, data: { asignaciones: { connect: { id: 'ajena' } } } }],
    ['update', { where: {}, data: { despacho: { connect: { id: 'otro' } } } }],
    ['upsert', { where: {}, create: {}, update: { etiquetas: { set: [] } } }],
  ])('%s con relaciones en los datos se rechaza', (operacion, args) => {
    expect(() => aplicar('Proceso', operacion, args)).toThrow(ErrorDeAislamiento);
  });

  it('un campo JSON con objetos no se confunde con una relación', () => {
    const args = {
      data: { procesoId: 'p', plataforma: 'RAMA_CPNU', datosProceso: { create: 1, connect: 2 } },
    };
    expect(() => aplicar('ProcesoPlataforma', 'create', args)).not.toThrow();
  });
});

describe('navegación desde Usuario', () => {
  it.each([
    ['include de relaciones', 'Usuario', { include: { membresias: true } }],
    ['select de relaciones', 'Usuario', { select: { membresias: true } }],
    ['conteo de relaciones', 'Usuario', { select: { _count: true } }],
    ['filtro por relaciones', 'Usuario', { where: { membresias: { some: {} } } }],
    ['orden por relaciones', 'Usuario', { orderBy: { membresias: { _count: 'desc' } } }],
    [
      'desde una membresía',
      'Membresia',
      { include: { usuario: { include: { membresias: true } } } },
    ],
    [
      'desde la auditoría',
      'RegistroAuditoria',
      { select: { actor: { select: { registrosAuditoria: true } } } },
    ],
    [
      'en un filtro profundo',
      'Proceso',
      {
        where: {
          OR: [
            { asignaciones: { some: { membresia: { usuario: { membresias: { none: {} } } } } } },
          ],
        },
      },
    ],
  ])('rechaza %s', (_caso, modelo, args) => {
    expect(() => aplicar(modelo, 'findMany', args)).toThrow(ErrorDeAislamiento);
  });

  it('permite los campos propios del usuario', () => {
    expect(() =>
      aplicar('Usuario', 'findMany', { select: { id: true, nombre: true }, where: { email: 'x' } }),
    ).not.toThrow();
    expect(() =>
      aplicar('Membresia', 'findMany', {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { usuario: { nombre: 'asc' } },
      }),
    ).not.toThrow();
  });

  it('permite navegar libremente entre modelos del despacho', () => {
    const args = {
      include: { plataformas: { include: { actuaciones: { include: { documentos: true } } } } },
    };
    expect(() => aplicar('Proceso', 'findMany', args)).not.toThrow();
  });
});

describe('metadatos del esquema', () => {
  it('todo modelo clasificado tiene su mapa de relaciones y viceversa', () => {
    expect(Object.keys(RELACIONES).sort()).toEqual(Object.keys(CLASIFICACION).sort());
  });

  it('los destinos de las relaciones son modelos conocidos', () => {
    const modelos = new Set(Object.keys(CLASIFICACION));
    for (const relaciones of Object.values(RELACIONES)) {
      for (const destino of Object.values(relaciones)) expect(modelos.has(destino)).toBe(true);
    }
  });

  it('los tipos obligan a declarar cada relación con su destino exacto', () => {
    // @ts-expect-error falta la relación "actuacion": el mapa debe estar completo.
    const incompleto: (typeof RELACIONES)['Documento'] = {};
    // @ts-expect-error el destino de "actuacion" es Actuacion, no Proceso.
    const destinoErroneo: (typeof RELACIONES)['Documento'] = { actuacion: 'Proceso' };
    expect([incompleto, destinoErroneo]).toHaveLength(2);
  });
});
