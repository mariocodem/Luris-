/**
 * Identificador legible del despacho a partir de su nombre: minúsculas, sin tildes y con
 * guiones ("Gómez & Asociados S.A.S." → "gomez-asociados-s-a-s"). Coincide con la restricción
 * CHECK `despachos_slug_formato`.
 */
export function generarSlug(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'despacho';
}
