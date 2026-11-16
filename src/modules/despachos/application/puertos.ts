import type { DespachoResumen } from '@/modules/usuarios/application/puertos';

export interface NuevoDespacho {
  readonly nombre: string;
  readonly slug: string;
  readonly nit: string | null;
}

export interface DespachoDetalle extends DespachoResumen {
  readonly slug: string;
  readonly nit: string | null;
  readonly miembrosActivos: number;
  readonly creadoEn: Date;
}

/** Administración de despachos (tenants). Solo la usa el superadmin. */
export interface RepositorioDeDespachos {
  /** Devuelve `{ duplicado }` si ya existe un despacho con ese slug o NIT. */
  crear(
    despacho: NuevoDespacho,
  ): Promise<{ readonly despacho: DespachoResumen } | { readonly duplicado: 'slug' | 'nit' }>;
  listar(): Promise<readonly DespachoDetalle[]>;
  buscar(despachoId: string): Promise<DespachoResumen | null>;
  cambiarEstado(despachoId: string, estado: 'ACTIVO' | 'SUSPENDIDO'): Promise<void>;
}
