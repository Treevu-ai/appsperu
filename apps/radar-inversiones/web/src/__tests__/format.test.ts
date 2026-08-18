import { describe, expect, it } from "vitest";
import { formatFecha, formatSoles, variacionCostoPct } from "@/lib/format";

describe("formatSoles", () => {
  it("formats a number as PEN currency without decimals", () => {
    expect(formatSoles(1853954)).toContain("1,853,954");
  });

  it("renders an explicit placeholder for null instead of S/ 0", () => {
    expect(formatSoles(null)).toBe("sin dato");
  });
});

describe("formatFecha", () => {
  it("formats an ISO date in es-PE medium style", () => {
    expect(formatFecha("2022-03-10")).toMatch(/2022/);
  });

  it("renders an explicit placeholder for a missing date", () => {
    expect(formatFecha(null)).toBe("sin fecha");
  });
});

describe("variacionCostoPct", () => {
  it("computes the real overrun observed in production data (Hospital Florencia de Mora)", () => {
    expect(variacionCostoPct(231477495.2, 368314197.8)).toBeCloseTo(59.1, 1);
  });

  it("returns 0 when costs match exactly", () => {
    expect(variacionCostoPct(1000, 1000)).toBe(0);
  });

  it("returns a negative value when the updated cost is lower", () => {
    expect(variacionCostoPct(1000, 800)).toBe(-20);
  });

  it("returns null instead of throwing when either amount is missing", () => {
    expect(variacionCostoPct(null, 1000)).toBeNull();
    expect(variacionCostoPct(1000, null)).toBeNull();
  });

  it("returns null instead of dividing by zero when montoViable is 0", () => {
    expect(variacionCostoPct(0, 1000)).toBeNull();
  });
});
