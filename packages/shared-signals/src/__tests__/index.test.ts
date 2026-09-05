import { describe, expect, it } from "vitest";
import { costDriftPct, esSobrecosto, SOBRECOSTO_UMBRAL_PCT } from "../index.js";

describe("costDriftPct", () => {
  it("computes a positive drift when the cost went up", () => {
    expect(costDriftPct(1000, 1500)).toBe(50);
  });

  it("computes a negative drift when the cost went down", () => {
    expect(costDriftPct(1000, 800)).toBe(-20);
  });

  it("returns null when monto_viable is missing or zero (never divides by zero)", () => {
    expect(costDriftPct(null, 1500)).toBeNull();
    expect(costDriftPct(0, 1500)).toBeNull();
  });

  it("returns null when costo_actualizado is missing", () => {
    expect(costDriftPct(1000, null)).toBeNull();
  });
});

describe("esSobrecosto", () => {
  it("uses SOBRECOSTO_UMBRAL_PCT (0) by default — any positive drift counts", () => {
    expect(SOBRECOSTO_UMBRAL_PCT).toBe(0);
    expect(esSobrecosto(0.01)).toBe(true);
    expect(esSobrecosto(0)).toBe(false);
    expect(esSobrecosto(-5)).toBe(false);
  });

  it("returns false for null (no verificable), never true by default", () => {
    expect(esSobrecosto(null)).toBe(false);
  });

  it("accepts a custom threshold", () => {
    expect(esSobrecosto(5, 10)).toBe(false);
    expect(esSobrecosto(15, 10)).toBe(true);
  });
});
