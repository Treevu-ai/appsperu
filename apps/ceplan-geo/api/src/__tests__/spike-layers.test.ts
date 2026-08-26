import { describe, expect, it } from "vitest";
import { recommendDecision } from "../cli/spike-layers.js";
import { PILOT_DEPARTMENTS } from "../lib/pilot-departments.js";

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
