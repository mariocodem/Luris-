import type { Prisma } from '@/generated/prisma/client';

/**
 * Metadatos del esquema que necesita el aislamiento por despacho.
 *
 * Los tipos obligan a que estén completos: si se agrega un modelo o una relación al esquema
 * y no se declara aquí, el proyecto no compila. Así ningún modelo queda sin clasificar.
 */
export type Modelo = Prisma.ModelName;

type Objetos<M extends Modelo> = Prisma.TypeMap['model'][M]['payload']['objects'];
type NombreDeModelo<P> = P extends readonly (infer E)[]
  ? NombreDeModelo<E>
  : P extends { name: infer N }
    ? N
    : never;

type MapaDeRelaciones = {
  readonly [M in Modelo]: {
    readonly [K in keyof Objetos<M>]-?: NombreDeModelo<NonNullable<Objetos<M>[K]>>;
  };
};

/** Para cada modelo: nombre de la relación → modelo de destino. */
export const RELACIONES: MapaDeRelaciones = {
  Despacho: {
    membresias: 'Membresia',
    procesos: 'Proceso',
    etiquetas: 'Etiqueta',
    registrosAuditoria: 'RegistroAuditoria',
  },
  Usuario: { membresias: 'Membresia', registrosAuditoria: 'RegistroAuditoria' },
  Membresia: {
    despacho: 'Despacho',
    usuario: 'Usuario',
    asignaciones: 'AsignacionProceso',
    credenciales: 'CredencialPlataforma',
    consultasMasivas: 'ConsultaMasiva',
    preferenciaNotificacion: 'PreferenciaNotificacion',
    notificaciones: 'Notificacion',
  },
  Proceso: {
    despacho: 'Despacho',
    asignaciones: 'AsignacionProceso',
    etiquetas: 'EtiquetaProceso',
    plataformas: 'ProcesoPlataforma',
  },
  AsignacionProceso: { proceso: 'Proceso', membresia: 'Membresia' },
  Etiqueta: { despacho: 'Despacho', procesos: 'EtiquetaProceso' },
  EtiquetaProceso: { proceso: 'Proceso', etiqueta: 'Etiqueta' },
  ProcesoPlataforma: { proceso: 'Proceso', actuaciones: 'Actuacion' },
  Actuacion: {
    procesoPlataforma: 'ProcesoPlataforma',
    documentos: 'Documento',
    notificaciones: 'Notificacion',
  },
  Documento: { actuacion: 'Actuacion' },
  CredencialPlataforma: { membresia: 'Membresia' },
  ConsultaMasiva: { creadaPor: 'Membresia', items: 'ItemConsultaMasiva' },
  ItemConsultaMasiva: { consultaMasiva: 'ConsultaMasiva' },
  PreferenciaNotificacion: { membresia: 'Membresia' },
  Notificacion: { destinatario: 'Membresia', actuacion: 'Actuacion' },
  RegistroAuditoria: { despacho: 'Despacho', actor: 'Usuario' },
};

/**
 * Cómo se aísla cada modelo en el cliente de un despacho:
 * - NEGOCIO: tiene `despachoId`; se filtra y se inyecta en cada operación.
 * - NEGOCIO_SOLO_AGREGAR: como NEGOCIO, pero solo admite lecturas y creaciones (auditoría).
 * - DESPACHO_PROPIO: la fila del propio despacho (filtro por `id`).
 * - USUARIO_DEL_DESPACHO: usuarios globales, visibles solo si tienen membresía en el despacho.
 */
export type Clasificacion =
  'NEGOCIO' | 'NEGOCIO_SOLO_AGREGAR' | 'DESPACHO_PROPIO' | 'USUARIO_DEL_DESPACHO';

export const CLASIFICACION: Readonly<Record<Modelo, Clasificacion>> = {
  Despacho: 'DESPACHO_PROPIO',
  Usuario: 'USUARIO_DEL_DESPACHO',
  Membresia: 'NEGOCIO',
  Proceso: 'NEGOCIO',
  AsignacionProceso: 'NEGOCIO',
  Etiqueta: 'NEGOCIO',
  EtiquetaProceso: 'NEGOCIO',
  ProcesoPlataforma: 'NEGOCIO',
  Actuacion: 'NEGOCIO',
  Documento: 'NEGOCIO',
  CredencialPlataforma: 'NEGOCIO',
  ConsultaMasiva: 'NEGOCIO',
  ItemConsultaMasiva: 'NEGOCIO',
  PreferenciaNotificacion: 'NEGOCIO',
  Notificacion: 'NEGOCIO',
  RegistroAuditoria: 'NEGOCIO_SOLO_AGREGAR',
};

/**
 * Campos que el cliente de un despacho puede modificar en modelos globales. Lo demás
 * (estado, plan, email, esSuperadmin…) solo se cambia con flujos de plataforma o autenticación.
 */
export const CAMPOS_EDITABLES: Readonly<Partial<Record<Modelo, ReadonlySet<string>>>> = {
  Despacho: new Set([
    'nombre',
    'nit',
    'logo',
    'metadata',
  ] satisfies (keyof Prisma.DespachoUpdateInput)[]),
  Usuario: new Set(['nombre', 'imagen'] satisfies (keyof Prisma.UsuarioUpdateInput)[]),
};
