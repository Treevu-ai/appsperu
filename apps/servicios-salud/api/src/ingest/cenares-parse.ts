import { parse } from "csv-parse/sync";
import type { CkanResource } from "@appsperu/ckan-client";

export type { CkanResource };

/**
 * A diferencia de RENIPRESS, el dataset de CENARES tiene un único recurso
 * CSV sin fecha en el nombre del archivo -- no hace falta elegir "el más
 * reciente" entre varios.
 */
export function pickCenaresResource(resources: CkanResource[]): CkanResource {
  const csv = resources.find((r) => (r.format ?? "").toUpperCase() === "CSV");
  if (!csv) {
    throw new Error("No se encontró ningún recurso CSV en el dataset de CENARES de datosabiertos.gob.pe.");
  }
  return csv;
}

export type RawRow = Record<string, string>;

/**
 * Parsea el CSV crudo de CENARES a filas tipadas. `relax_column_count`
 * porque al menos una fila real trae texto libre en `OBSERVACION` con
 * comas/punto y coma que rompen el conteo estricto de columnas (confirmado
 * en vivo, 2026-09-19). Encoding Latin-1 (confirmado: "Ñ"/tildes llegan
 * corruptas bajo lectura UTF-8 ingenua) -- el texto ya debe venir
 * decodificado como latin1 antes de llamar a esta función.
 */
export function parseCenaresCsv(csvText: string): RawRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];
}

export function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function parseDecimal(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Fechas del CSV vienen como dd/mm/aaaa. */
export function parseFechaDDMMYYYY(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}
