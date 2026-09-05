import { parse } from "csv-parse/sync";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

/**
 * El nombre del archivo trae la fecha de corte (RENIPRESS_31-08-2026.csv).
 * No hay garantía de que el catálogo devuelva los recursos ordenados por
 * fecha, así que se extrae y compara explícitamente en vez de asumir que
 * el último elemento del array es el más reciente.
 */
export function extractDateFromRenipressUrl(url: string): Date | null {
  const match = url.match(/RENIPRESS_(\d{2})-(\d{2})-(\d{4})\.csv/i);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pickLatestRenipressResource(resources: CkanResource[]): CkanResource {
  const csvResources = resources.filter((r) => (r.format ?? "").toUpperCase() === "CSV");
  if (csvResources.length === 0) {
    throw new Error("No se encontró ningún recurso CSV en el dataset RENIPRESS de datosabiertos.gob.pe.");
  }

  return csvResources.reduce((latest, current) => {
    const currentDate = extractDateFromRenipressUrl(current.url);
    const latestDate = extractDateFromRenipressUrl(latest.url);
    if (!currentDate) return latest;
    if (!latestDate) return current;
    return currentDate > latestDate ? current : latest;
  });
}

export type RawRow = Record<string, string>;

/**
 * Parsea el CSV crudo de RENIPRESS a filas tipadas. Función pura, separada
 * de la descarga/persistencia, para poder probarla contra un fragmento real
 * sin red ni base de datos.
 */
export function parseRenipressCsv(csvText: string): RawRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];
}

export function parseDecimal(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

export function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
