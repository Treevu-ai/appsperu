import { parse } from "csv-parse/sync";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
  created?: string;
  last_modified?: string;
}

/**
 * El nombre de archivo de INFOMIDIS es demasiado inconsistente para usarlo
 * como señal de "más reciente" (confirmado en vivo: `202409_INFOMIDIS.csv`,
 * `OCTUBRE_2024.csv`, `MARZO2025_1.csv`, `202506.csv` — sin patrón común).
 * El propio catálogo además trae duplicados exactos del mismo mes y al menos
 * un recurso con `format: "data"` y URL vacía. La única señal confiable es
 * el timestamp `created` de CKAN (formato Drupal `MM/DD/YYYY - HH:MM`).
 */
export function parseCkanDrupalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, mm, dd, yyyy, hh, min] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCsvFormat(format: string | undefined): boolean {
  return (format ?? "").replace(/^\./, "").toUpperCase() === "CSV";
}

export function pickLatestInfomidisResource(resources: CkanResource[]): CkanResource {
  const candidates = resources.filter((r) => isCsvFormat(r.format) && Boolean(r.url));
  if (candidates.length === 0) {
    throw new Error("No se encontró ningún recurso CSV con URL válida en el dataset INFOMIDIS.");
  }

  return candidates.reduce((latest, current) => {
    const currentDate = parseCkanDrupalDate(current.created);
    const latestDate = parseCkanDrupalDate(latest.created);
    if (!currentDate) return latest;
    if (!latestDate) return current;
    return currentDate > latestDate ? current : latest;
  });
}

export type RawRow = Record<string, string>;

/**
 * Parsea el CSV crudo de INFOMIDIS a filas tipadas. Función pura, separada
 * de la descarga/persistencia, para poder probarla sin red ni base de datos.
 */
export function parseInfomidisCsv(csvText: string): RawRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Índice de columnas por palabras clave normalizadas (sin tildes/ñ/°), no
 * por nombre exacto — el esquema de INFOMIDIS puede variar levemente entre
 * cortes (ver riesgo documentado en el PRD). Construir una vez por archivo,
 * no por fila.
 */
export function buildHeaderIndex(row: RawRow): Map<string, string> {
  const index = new Map<string, string>();
  for (const key of Object.keys(row)) {
    index.set(normalizeHeader(key), key);
  }
  return index;
}

/** Devuelve el valor de la primera columna cuyo nombre normalizado contiene
 * todas las palabras clave dadas, o `undefined` si ninguna columna calza
 * (se registra como advertencia en el conector, no como error fatal). */
export function findColumnValue(row: RawRow, index: Map<string, string>, mustContainAll: string[]): string | undefined {
  for (const [normalized, originalKey] of index) {
    if (mustContainAll.every((token) => normalized.includes(token))) {
      return row[originalKey];
    }
  }
  return undefined;
}

/**
 * Igual que `findColumnValue`, pero prueba varios conjuntos alternativos de
 * palabras clave en orden — necesario porque MIDIS renombra programas entre
 * cortes (confirmado en vivo: "QALI WARMA" pasó a llamarse "WASI MIKUNA"
 * entre el corte de 2024-08 y el de 2026-04, mismo programa, nombre nuevo).
 */
export function findColumnValueAny(row: RawRow, index: Map<string, string>, alternatives: string[][]): string | undefined {
  for (const tokens of alternatives) {
    const value = findColumnValue(row, index, tokens);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** "1,804" -> 1804. La coma es separador de miles en este archivo, no
 * decimal — confirmado en vivo contra una fila real. Vacío -> null, nunca 0
 * (un distrito sin dato de un programa no es lo mismo que cobertura cero). */
export function parseInfomidisNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** "20241031" -> "2024-10-31". */
export function parseFechaCorte(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm}-${dd}`;
}
