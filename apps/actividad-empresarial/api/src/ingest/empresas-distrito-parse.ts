import { parse } from "csv-parse/sync";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

/** Columnas de mes en el orden real del CSV — nótese "SETIEMBRE", no
 * "SEPTIEMBRE" (confirmado en el header real del recurso). */
export const MONTH_COLUMNS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

function isCsvFormat(format: string | undefined): boolean {
  return (format ?? "").replace(/^\./, "").toUpperCase() === "CSV";
}

/**
 * A diferencia de RENIPRESS/INFOMIDIS, este dataset confirmó un único
 * recurso CSV de datos (más Diccionario/Metadatos, que no son CSV). Si en
 * el futuro aparece más de uno, no hay forma segura de saber cuál es "el
 * correcto" sin abrirlo — se advierte explícitamente en vez de asumir.
 */
export function pickEmpresasResource(resources: CkanResource[]): { resource: CkanResource; warning: string | null } {
  const candidates = resources.filter((r) => isCsvFormat(r.format) && Boolean(r.url));
  if (candidates.length === 0) {
    throw new Error("No se encontró ningún recurso CSV con URL válida en el dataset de empresas del sector privado.");
  }
  if (candidates.length === 1) {
    return { resource: candidates[0], warning: null };
  }
  return {
    resource: candidates[candidates.length - 1],
    warning: `Se encontraron ${candidates.length} recursos CSV (se esperaba 1) — se usó el último del arreglo: "${candidates[candidates.length - 1].name}". Verificar manualmente cuál corresponde al año más reciente.`,
  };
}

/**
 * El año de los datos viene del título/nombre del recurso (ej. "...año
 * 2022"), NUNCA de la columna FECHA_CORTE del CSV — esa columna es la
 * fecha de publicación del corte (confirmado en vivo: FECHA_CORTE=20230807
 * para datos de 2022), no el año que reportan las columnas de mes.
 */
export function extractYearFromResourceName(name: string): number | null {
  const matches = [...name.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

export type RawRow = Record<string, string>;

/** Parsea el CSV crudo a filas tipadas. Función pura, sin red ni base de datos. */
export function parseEmpresasCsv(csvText: string): RawRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];
}

/** "546 " -> 546. Confirmado en vivo: es solo un espacio final, no un
 * separador de miles interno (valores de 5 dígitos como "16523 " para Lima
 * se leyeron intactos). Vacío/no numérico -> null, nunca 0. */
export function parseCount(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
