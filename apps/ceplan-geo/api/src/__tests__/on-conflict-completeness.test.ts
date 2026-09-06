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
 * Este test no ejecuta el connector — parsea el SQL fuente y verifica que
 * toda columna del INSERT (salvo la clave de conflicto) aparezca en el SET.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractInsertColumns(source: string, table: string): string[] {
  const m = source.match(new RegExp(`INSERT INTO ${table}[^(]*\\(([^)]+)\\)`));
  if (!m) throw new Error(`No se pudo extraer columnas del INSERT para ${table}`);
  return m[1].split(",").map((c) => c.trim());
}

function extractConflictKey(source: string): string[] {
  const m = source.match(/ON CONFLICT\s*\(([^)]+)\)/);
  if (!m) throw new Error("No se encontró ON CONFLICT (...)");
  return m[1].split(",").map((c) => c.trim());
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

function extractSetColumns(source: string): string[] {
  const m = source.match(/DO UPDATE SET([\s\S]+?)`/);
  if (!m) throw new Error("No se encontró DO UPDATE SET");
  return splitTopLevel(m[1]).map((assignment) => assignment.split("=")[0].trim());
}

function assertOnConflictIsComplete(source: string, table: string): void {
  const insertColumns = extractInsertColumns(source, table);
  const conflictKey = extractConflictKey(source);
  const setColumns = extractSetColumns(source);

  const missing = insertColumns.filter((col) => !conflictKey.includes(col) && !setColumns.includes(col));
  expect(missing, `Columnas del INSERT ausentes del SET en ${table}: ${missing.join(", ")}`).toEqual([]);
}

describe("ON CONFLICT DO UPDATE SET completeness (regresión invierte-connector, 2026-09-05)", () => {
  it("sbn_supervision_predios: toda columna insertada se refresca en un re-ingest", () => {
    const source = readSource("../ingest/sbn-supervision-connector.ts");
    assertOnConflictIsComplete(source, "sbn_supervision_predios");
  });
});
