import { describe, expect, it, vi } from "vitest";

// CT-22-LIMA (2026-09-09): mismo patrón que mef-connector-file-size-drift.test.ts —
// mockear el pool para poder importar mef-connector.ts en un test unitario puro,
// sin tocar base de datos.
vi.mock("../db/pool.js", () => ({ pool: {} }));
vi.mock("../db/budget-coverage.js", () => ({ refreshBudgetCoverageSnapshots: vi.fn() }));

import { chunkRowsBySize, saveFilteredBatch } from "../ingest/mef-connector.js";
import type { PoolClient } from "pg";

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

describe("saveFilteredBatch (hallazgo CodeRabbit PR #145: persistencia atómica multi-chunk)", () => {
  function mockClient(queryImpl: (sql: string) => Promise<unknown>): PoolClient {
    return { query: vi.fn(queryImpl) } as unknown as PoolClient;
  }

  it("envuelve todos los INSERT de chunks en BEGIN/COMMIT", async () => {
    const calls: string[] = [];
    let nextId = 1;
    const client = mockClient(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("INSERT")) return { rows: [{ id: nextId++ }] };
      return undefined;
    });

    // saveFilteredBatch trocea por MAX_JSONB_PAYLOAD_BYTES (100MB, interno) —
    // estas filas caben en un solo chunk; lo que importa acá es que incluso
    // el caso de un chunk pase por BEGIN/COMMIT (antes del fix, ni ese caso
    // los tenía).
    const rows = Array.from({ length: 5 }, (_, i) => ({ valor: "x".repeat(30), i }));
    const ids = await saveFilteredBatch(client, "resource-1", rows);

    expect(ids).toEqual([1]);
    expect(calls[0]).toBe("BEGIN");
    expect(calls.at(-1)).toBe("COMMIT");
    expect(calls.some((sql) => sql.includes("INSERT INTO raw_mef_batches"))).toBe(true);
  });

  it("hace ROLLBACK y relanza si un INSERT de chunk falla", async () => {
    const calls: string[] = [];
    const client = mockClient(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("INSERT")) throw new Error("boom");
      return undefined;
    });

    await expect(saveFilteredBatch(client, "resource-1", [{ i: 0 }])).rejects.toThrow("boom");
    expect(calls.at(-1)).toBe("ROLLBACK");
  });
});
