import { parse } from "csv-parse/sync";
import type { CkanResource } from "@appsperu/ckan-client";

export type { CkanResource };

/**
 * Igual que CENARES distribución: un único recurso CSV, sin fecha en el
 * nombre del archivo -- no hace falta elegir "el más reciente" entre varios.
 */
export function pickCenaresPecosasResource(resources: CkanResource[]): CkanResource {
  const csv = resources.find((r) => (r.format ?? "").toUpperCase() === "CSV");
  if (!csv) {
    throw new Error("No se encontró ningún recurso CSV en el dataset de Pecosas de CENARES de datosabiertos.gob.pe.");
  }
  return csv;
}

export type RawRow = Record<string, string>;

export interface RejectedRawRow {
  raw: RawRow;
  reason: string;
}

export interface ParsedCenaresPecosasCsv {
  rows: RawRow[];
  rejected: RejectedRawRow[];
}

/** Las 13 columnas reales del CSV (confirmadas en vivo el 2026-09-23) -- una
 * fila que no las trae todas está truncada/desalineada. */
const EXPECTED_COLUMNS = [
  "ANIOPECOSA",
  "NROPECOSA",
  "FECHAPECOSA",
  "CODIGO_SIGA",
  "NOMBRE_ALM",
  "NROPEDIDO",
  "DESCMARCAPECOSA",
  "ANIO_OC",
  "NRO_OC",
  "OBSERVACION_OC",
  "MARCA_OC",
  "PROVEEDOR",
  "DESC_PROVEEDOR",
] as const;

/**
 * Parsea el CSV crudo de Pecosas a filas tipadas. Mismo criterio que CENARES
 * distribución: `relax_column_count` para tolerar texto libre con separador
 * de más en `OBSERVACION_OC` cuando viene protegido por comillas, pero una
 * fila con columnas faltantes (desalineada de verdad) se rechaza y cuenta en
 * vez de insertarse con columnas corridas en silencio.
 */
export function parseCenaresPecosasCsv(csvText: string): ParsedCenaresPecosasCsv {
  const parsed = parse(csvText, {
    columns: true,
    delimiter: ";",
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];

  const rows: RawRow[] = [];
  const rejected: RejectedRawRow[] = [];
  for (const row of parsed) {
    const missing = EXPECTED_COLUMNS.filter((col) => row[col] === undefined);
    if (missing.length > 0) {
      rejected.push({ raw: row, reason: `fila desalineada, faltan columnas: ${missing.join(", ")}` });
      continue;
    }
    rows.push(row);
  }
  return { rows, rejected };
}

export function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Fechas del CSV de Pecosas vienen como d/m/aaaa, SIN cero a la izquierda
 * (confirmado en vivo: "6/03/2023") -- a diferencia del dataset de
 * distribución (dd/mm/aaaa con cero a la izquierda siempre), por eso no
 * reutiliza `parseFechaDDMMYYYY` de cenares-parse.ts.
 */
export function parseFechaFlexibleDDMMYYYY(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
