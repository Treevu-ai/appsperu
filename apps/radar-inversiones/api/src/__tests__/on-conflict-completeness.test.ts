import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regresión para el bug encontrado el 2026-09-05: un `ON CONFLICT ... DO
 * UPDATE SET` que omite una columna presente en el INSERT hace que esa
 * columna nunca se actualice en un re-ingest de una fila ya conocida, aunque
 * el dato fuente haya cambiado (confirmado en vivo: `nombre` quedaba
 * congelado en el primer valor visto para un CUI). Este test no ejecuta el
 * connector — parsea el SQL fuente y verifica que toda columna del INSERT
 * (salvo la clave de conflicto) aparezca en el SET.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractInsertColumns(source: string, table: string): string[] {
  const insertMatch = source.match(new RegExp(`INSERT INTO ${table}\\s*\\(([^)]+)\\)`));
  if (!insertMatch) throw new Error(`No se encontró INSERT INTO ${table}`);
  return insertMatch[1].split(",").map((c) => c.trim());
}

function extractConflictKey(source: string): string[] {
  const match = source.match(/ON CONFLICT \(([^)]+)\)/);
  if (!match) throw new Error("No se encontró ON CONFLICT (...)");
  return match[1].split(",").map((c) => c.trim());
}

function extractSetColumns(source: string): string[] {
  const match = source.match(/DO UPDATE SET (.+?)`/s);
  if (!match) throw new Error("No se encontró DO UPDATE SET");
  return match[1].split(",").map((assignment) => assignment.split("=")[0].trim());
}

function assertOnConflictIsComplete(source: string, table: string): void {
  const insertColumns = extractInsertColumns(source, table);
  const conflictKey = extractConflictKey(source);
  const setColumns = extractSetColumns(source);

  const missing = insertColumns.filter((col) => !conflictKey.includes(col) && !setColumns.includes(col));
  expect(missing, `Columnas del INSERT ausentes del SET en ${table}: ${missing.join(", ")}`).toEqual([]);
}

describe("ON CONFLICT DO UPDATE SET completeness (regresión invierte-connector)", () => {
  it("investments: toda columna insertada se refresca en un re-ingest", () => {
    const source = readSource("../ingest/invierte-connector.ts");
    assertOnConflictIsComplete(source, "investments");
  });

  it("investments_deactivated: toda columna insertada se refresca en un re-ingest", () => {
    const source = readSource("../ingest/invierte-desactivadas-connector.ts");
    assertOnConflictIsComplete(source, "investments_deactivated");
  });
});
