/**
 * Normaliza para agrupar y comparar, pero mantiene `object_original` intacto.
 * No intenta emitir una categoría jurídica ni sustituir revisión humana.
 */
export function normalizeContractObject(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}
