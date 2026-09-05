import { describe, expect, it, vi } from "vitest";

// pilot-departments.ts importa el pool de Postgres (para una función no
// usada por estos tests) que lanza al cargar el módulo si DATABASE_URL no
// está definida — sin esto, este archivo nunca cargaba en CI (no hay
// DATABASE_URL en ese entorno). Mismo mock que ya usan crossref-api.test.ts
// y api.test.ts en esta misma app.
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const { recommendDecision } = await import("../cli/spike-layers.js");
const { PILOT_DEPARTMENTS } = await import("../lib/pilot-departments.js");

describe("spike-layers", () => {
  it("recommends POSPONER for layers above 200k features", () => {
    expect(recommendDecision({ ok: true, numberMatched: 345_634 })).toBe("POSPONER");
  });

  it("recommends AUTOMATIZABLE for small layers", () => {
    expect(recommendDecision({ ok: true, numberMatched: 1_744 })).toBe("AUTOMATIZABLE");
  });

  it("recommends MVP_ACOTADO for medium layers", () => {
    expect(recommendDecision({ ok: true, numberMatched: 120_000 })).toBe("MVP_ACOTADO");
  });
});

describe("pilot departments", () => {
  it("defines exactly 5 ALSOL pilot regions with expected district counts", () => {
    expect(PILOT_DEPARTMENTS).toHaveLength(5);
    expect(PILOT_DEPARTMENTS.map((row) => row.name)).toEqual([
      "LA LIBERTAD",
      "LAMBAYEQUE",
      "PIURA",
      "CAJAMARCA",
      "CUSCO",
    ]);
    expect(PILOT_DEPARTMENTS.reduce((sum, row) => sum + row.expectedDistricts, 0)).toBe(425);
  });
});
