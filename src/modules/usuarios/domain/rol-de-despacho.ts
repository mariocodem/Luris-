/**
 * Roles dentro de un despacho (§5). El superadmin no es un rol de despacho: es un atributo del
 * usuario (`esSuperadmin`) porque opera la plataforma y no pertenece a ningún despacho.
 *
 * Deben coincidir con la restricción CHECK `membresias_rol_valido` de la base de datos.
 */
export const ROLES_DE_DESPACHO = ['administrador', 'abogado', 'asistente'] as const;

export type RolDeDespacho = (typeof ROLES_DE_DESPACHO)[number];

export function esRolDeDespacho(valor: string): valor is RolDeDespacho {
  return (ROLES_DE_DESPACHO as readonly string[]).includes(valor);
}
