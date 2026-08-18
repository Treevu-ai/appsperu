import { describe, expect, it } from "vitest";
import { costDriftPct, gapFisicoFinanciero } from "../signals/signals.js";

describe("costDriftPct", () => {
  it("computes a positive drift when cost increased", () => {
    expect(costDriftPct(1000, 1500)).toBe(50);
  });

  it("computes a negative drift when cost decreased", () => {
    expect(costDriftPct(1000, 800)).toBe(-20);
  });

  it("returns null when there is no viable amount to compare against", () => {
    expect(costDriftPct(null, 1500)).toBeNull();
    expect(costDriftPct(0, 1500)).toBeNull();
  });

  it("returns null when the updated cost is missing", () => {
    expect(costDriftPct(1000, null)).toBeNull();
  });
});

describe("gapFisicoFinanciero", () => {
  it("computes the gap between physical and financial progress", () => {
    expect(gapFisicoFinanciero(80, 50)).toBe(30);
  });

  it("returns a negative gap when financial execution outpaces physical progress", () => {
    expect(gapFisicoFinanciero(30, 60)).toBe(-30);
  });

  it("returns null when either input is missing", () => {
    expect(gapFisicoFinanciero(null, 50)).toBeNull();
    expect(gapFisicoFinanciero(80, null)).toBeNull();
  });
});
