import { describe, expect, it, vi } from "vitest";

// CT-22-LIMA (2026-09-09): mismo patrón que mef-connector-file-size-drift.test.ts —
// mockear el pool para poder importar mef-connector.ts en un test unitario puro,
// sin tocar base de datos.
vi.mock("../db/pool.js", () => ({ pool: {} }));
vi.mock("../db/budget-coverage.js", () => ({ refreshBudgetCoverageSnapshots: vi.fn() }));

import { chunkRowsBySize } from "../ingest/mef-connector.js";

describe("chunkRowsBySize (CT-22-LIMA)", () => {
  it("returns a single chunk when everything fits under the limit", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, nombre: "fila pequeña" }));
    const chunks = chunkRowsBySize(rows, 1024 * 1024);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(100);
  });

  it("splits into multiple chunks when the payload would exceed maxBytes", () => {
    // Cada fila pesa ~40 bytes en JSON; con maxBytes=100 deberían caber ~2 por chunk.
    const rows = Array.from({ length: 10 }, (_, i) => ({ valor: `x`.repeat(30), i }));
    const chunks = chunkRowsBySize(rows, 100);
    expect(chunks.length).toBeGreaterThan(1);
    const totalRows = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(totalRows).toBe(10);
  });

  it("never drops or duplicates rows across chunks, regardless of order", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const chunks = chunkRowsBySize(rows, 2000);
    const flattened = chunks.flat();
    expect(flattened).toHaveLength(500);
    expect(flattened.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("puts a single oversized row in its own chunk instead of looping forever", () => {
    const hugeRow = { data: "x".repeat(1000) };
    const rows = [{ id: 1 }, hugeRow, { id: 2 }];
    const chunks = chunkRowsBySize(rows, 100);
    expect(chunks.flat()).toHaveLength(3);
    expect(chunks.some((chunk) => chunk.includes(hugeRow))).toBe(true);
  });

  it("returns an empty array for no rows", () => {
    expect(chunkRowsBySize([], 1024)).toEqual([]);
  });
});
