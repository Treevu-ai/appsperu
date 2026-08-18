import { describe, expect, it } from "vitest";
import { computeConcentration } from "../suppliers/concentration.js";

describe("computeConcentration", () => {
  it("returns all zeros instead of dividing by zero on an empty list", () => {
    expect(computeConcentration([])).toEqual({ cr3: 0, cr5: 0, hhi: 0, proveedoresConsiderados: 0 });
  });

  it("returns all zeros when total value is zero (not NaN)", () => {
    const result = computeConcentration([{ supplierId: "a", valorTotal: 0 }]);
    expect(result.cr3).toBe(0);
    expect(result.hhi).toBe(0);
  });

  it("computes HHI=10000 for a pure monopoly (one supplier, 100%)", () => {
    const result = computeConcentration([{ supplierId: "a", valorTotal: 1000 }]);
    expect(result.hhi).toBe(10000);
    expect(result.cr3).toBe(100);
  });

  it("computes low HHI for evenly split suppliers", () => {
    const shares = Array.from({ length: 10 }, (_, i) => ({ supplierId: `s${i}`, valorTotal: 100 }));
    const result = computeConcentration(shares);
    // 10 proveedores parejos al 10% cada uno -> HHI = 10 * 10^2 = 1000
    expect(result.hhi).toBe(1000);
    expect(result.cr3).toBe(30);
  });

  it("ranks by value before taking CR3/CR5, not input order", () => {
    const result = computeConcentration([
      { supplierId: "small", valorTotal: 100 },
      { supplierId: "big", valorTotal: 900 },
    ]);
    expect(result.cr3).toBe(100);
  });
});
