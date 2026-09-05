/**
 * Extrae el RUC de un `supplier_id` de OCDS con el formato `PE-RUC-<11 dígitos>`
 * — el 77.3% de la muestra de compras-publicas (confirmado en vivo el
 * 2026-08-20, ver docs/data-contracts/sunat-padron-ruc.md). El resto son
 * consorcios con un id interno más corto que no es RUC estándar y no cruzan
 * por esta vía; en ese caso devuelve `null`, nunca un valor inventado.
 *
 * Consolidado de 3 copias idénticas que existían en `identidad-fiscal`,
 * `proveedores-sancionados` y `salud-institucional` (CX-09, ver
 * docs/adr/0019-alcance-workspace-utilidades-compartidas.md).
 */
const RUC_PREFIX = "PE-RUC-";

export function extractRuc(supplierId: string): string | null {
  if (!supplierId.startsWith(RUC_PREFIX)) return null;
  const ruc = supplierId.slice(RUC_PREFIX.length);
  return /^\d{11}$/.test(ruc) ? ruc : null;
}

export type EstadoTemporal = true | false | "NO_VERIFICABLE";

function toDateOnly(value: unknown): number | null {
  if (value instanceof Date) {
    const utc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    return Number.isNaN(utc) ? null : utc;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(date) ? null : date;
}

/**
 * Responde solo la pregunta temporal verificable: si un estado (inhabilitación,
 * condición tributaria, etc.) cubría una fecha de referencia (típicamente la
 * fecha de adjudicación de un contrato). El estado "actual" de la fuente es
 * contemporáneo a la extracción y no sustituye este cálculo — un `true`/`false`
 * solo se devuelve cuando hay evidencia temporal real; si falta, es
 * `"NO_VERIFICABLE"`, nunca se infiere `false` por ausencia de dato.
 *
 * Consolidado desde `proveedores-sancionados/lib/temporal-status.ts` (CX-09) —
 * generalizado más allá de inhabilitaciones: cualquier estado con un rango
 * `[desde, hasta]` puede usarla.
 */
export function vigenteEnFecha(fechaReferencia: unknown, desde: unknown, hasta: unknown): EstadoTemporal {
  const reference = toDateOnly(fechaReferencia);
  const start = toDateOnly(desde);
  const end = toDateOnly(hasta);
  if (reference === null || start === null) return "NO_VERIFICABLE";
  if (reference < start) return false;
  return end === null || reference <= end;
}

export function consolidarEstadoTemporal(estados: EstadoTemporal[]): EstadoTemporal {
  if (estados.some((estado) => estado === true)) return true;
  if (estados.length > 0 && estados.every((estado) => estado === false)) return false;
  return "NO_VERIFICABLE";
}
