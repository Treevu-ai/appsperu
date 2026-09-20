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

export interface RejectedRawRow {
  raw: RawRow;
  reason: string;
}

export interface ParsedCenaresCsv {
  rows: RawRow[];
  rejected: RejectedRawRow[];
}

/** Las 18 columnas reales del CSV (ver fixture en el test) — una fila que no
 * las trae todas está truncada/desalineada, no es un caso válido de texto
 * libre con separador de más. */
const EXPECTED_COLUMNS = [
  "ESTRATEGIA",
  "META",
  "CODMEF",
  "DESTINO",
  "CODIGOSISMED",
  "CODIGOSIGA",
  "ITEM",
  "CANTIDAD",
  "NROCD",
  "OBSERVACION",
  "REFERENCIA",
  "FECHACREACION",
  "SITUACION",
  "PENDIENTE",
  "NROPECOSA",
  "FECHAPECOSA",
  "ESTADODESPACHO",
  "REFRIGERADO",
] as const;

/**
 * Parsea el CSV crudo de CENARES a filas tipadas. `relax_column_count`
 * porque al menos una fila real trae texto libre en `OBSERVACION` con
 * comas/punto y coma que rompen el conteo estricto de columnas (confirmado
 * en vivo, 2026-09-19) — pero eso solo es seguro cuando el separador de más
 * viene protegido por comillas (csv-parse ya lo respeta) y las 18 columnas
 * con nombre siguen presentes. Una fila con MENOS separadores que el
 * encabezado (desalineada de verdad, no solo un `;` libre dentro de un
 * campo entrecomillado) deja algunas de esas 18 claves como `undefined` —
 * se rechaza y cuenta en vez de insertarse con columnas corridas en
 * silencio. Encoding Latin-1 (confirmado: "Ñ"/tildes llegan corruptas bajo
 * lectura UTF-8 ingenua) -- el texto ya debe venir decodificado como latin1
 * antes de llamar a esta función.
 */
export function parseCenaresCsv(csvText: string): ParsedCenaresCsv {
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
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // Valida que sea una fecha calendario real (ej. rechaza 31/02/2024) — Date
  // normaliza silenciosamente días fuera de rango en vez de lanzar, así que
  // se verifica con un round-trip contra los componentes originales.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}
