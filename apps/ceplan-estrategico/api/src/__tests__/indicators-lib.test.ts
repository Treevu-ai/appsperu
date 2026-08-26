import { describe, expect, it, vi } from "vitest";

vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: vi.fn() },
}));

import { PBA_MAPPING_V1 } from "../lib/indicators/plan-budget-alignment.js";
import { buildNationalLevel } from "../lib/indicators/ceplan-national.js";

describe("buildNationalLevel", () => {
  it("computes segPp and executionEfficiency from CUMP02/CUMP03", () => {
    const rows = [
      { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "80.00", measurement_date: "2024-01-01" },
      { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "100.00", measurement_date: "2024-01-01" },
    ];
    const result = buildNationalLevel(rows, "GN", 2026);
    expect(result.segPp).toBe(20);
    expect(result.executionEfficiency).toBe(0.8);
  });
});

describe("PBA_MAPPING_V1", () => {
  it("includes at least 10 dimension mappings", () => {
    expect(PBA_MAPPING_V1.length).toBeGreaterThanOrEqual(10);
  });
});
