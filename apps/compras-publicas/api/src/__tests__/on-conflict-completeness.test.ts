import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regresión del sweep de código del 2026-09-05: un `ON CONFLICT ... DO
 * UPDATE SET` que omite una columna presente en el INSERT hace que esa
 * columna nunca se actualice en un re-ingest de una fila ya conocida, aunque
 * el dato fuente haya cambiado. Ver el mismo test en radar-inversiones/api
 * (originador del hallazgo, verificado en vivo ahí).
 *
 * Este test no ejecuta los connectors — parsea el SQL fuente. Como estos
 * archivos insertan en varias tablas dentro del mismo query template, se
 * extrae cada bloque `INSERT INTO t (...) ... ON CONFLICT (...) DO UPDATE
 * SET ...` por separado. Columnas intencionalmente insert-only (ej.
 * first_seen en supplier_profiles, que preserva la fecha del primer
 * avistamiento) se excluyen explícitamente.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

interface QueryBlock {
  table: string;
  raw: string;
}

function extractQueryBlocks(source: string): QueryBlock[] {
  // Cada sentencia SQL vive en su propio template literal (sin backticks
  // embebidos), así que delimitar por backtick evita que una búsqueda
  // perezosa de "ON CONFLICT ... DO UPDATE SET" salte por encima de un
  // "ON CONFLICT DO NOTHING" de una sentencia distinta y fusione dos bloques.
  const stringRegex = /`([^`]*)`/g;
  const blocks: QueryBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = stringRegex.exec(source))) {
    const text = m[1];
    if (/INSERT INTO/.test(text) && /ON CONFLICT/.test(text) && /DO UPDATE SET/.test(text)) {
      const tableMatch = text.match(/INSERT INTO\s+(\w+)/);
      if (tableMatch) blocks.push({ table: tableMatch[1], raw: text });
    }
  }
  return blocks;
}

function extractInsertColumns(block: string, table: string): string[] {
  const m = block.match(new RegExp(`INSERT INTO ${table}[^(]*\\(([^)]+)\\)`));
  if (!m) throw new Error(`No se pudo extraer columnas del INSERT para ${table}`);
  return m[1].split(",").map((c) => c.trim());
}

function extractConflictKey(block: string): string[] {
  const m = block.match(/ON CONFLICT\s*\(([^)]+)\)/);
  return m ? m[1].split(",").map((c) => c.trim()) : [];
}

function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function extractSetColumns(block: string): string[] {
  const m = block.match(/DO UPDATE SET([\s\S]+)$/);
  if (!m) throw new Error("No se encontró DO UPDATE SET");
  return splitTopLevel(m[1]).map((assignment) => assignment.split("=")[0].trim());
}

function assertQueryBlockComplete(block: QueryBlock, ignoredColumns: readonly string[] = []): void {
  const insertColumns = extractInsertColumns(block.raw, block.table);
  const conflictKey = extractConflictKey(block.raw);
  const setColumns = extractSetColumns(block.raw);

  const missing = insertColumns.filter(
    (col) => !conflictKey.includes(col) && !setColumns.includes(col) && !ignoredColumns.includes(col)
  );
  expect(missing, `Columnas del INSERT ausentes del SET en ${block.table}: ${missing.join(", ")}`).toEqual([]);
}

const SUPPLIER_PROFILES_IGNORED = ["first_seen"]; // insert-only por diseño: preserva la fecha del primer avistamiento

describe("ON CONFLICT DO UPDATE SET completeness (regresión invierte-connector, 2026-09-05)", () => {
  it("seace-public-minor-contracts-connector: municipalities", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/seace-public-minor-contracts-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "municipalities")[0]);
  });

  it("seace-public-minor-contracts-connector: supplier_profiles", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/seace-public-minor-contracts-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "supplier_profiles")[0], SUPPLIER_PROFILES_IGNORED);
  });

  it("seace-public-minor-contracts-connector: minor_contracts", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/seace-public-minor-contracts-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "minor_contracts")[0]);
  });

  it("legacy-seace-orders-connector: municipalities", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/legacy-seace-orders-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "municipalities")[0]);
  });

  it("legacy-seace-orders-connector: supplier_profiles", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/legacy-seace-orders-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "supplier_profiles")[0], SUPPLIER_PROFILES_IGNORED);
  });

  it("legacy-seace-orders-connector: minor_contracts", () => {
    const blocks = extractQueryBlocks(readSource("../ingest/legacy-seace-orders-connector.ts"));
    assertQueryBlockComplete(blocks.filter((b) => b.table === "minor_contracts")[0]);
  });
});
