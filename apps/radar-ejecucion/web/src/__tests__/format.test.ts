import { describe, expect, it } from "vitest";
import { formatFecha, formatPct, formatSoles } from "@/lib/format";

describe("formatSoles", () => {
  it("formats a number as PEN currency without decimals", () => {
    expect(formatSoles(1200000)).toContain("1,200,000");
  });
});

describe("formatPct", () => {
  it("formats a percentage with one decimal", () => {
    expect(formatPct(43.256)).toBe("43.3%");
  });

  it("renders an explicit placeholder for null instead of 0%", () => {
    expect(formatPct(null)).toBe("sin dato");
  });
});

describe("formatFecha", () => {
  it("formats an ISO date in es-PE medium style", () => {
    expect(formatFecha("2026-08-16")).toMatch(/2026/);
  });

  it("returns the original string when the date is invalid", () => {
    expect(formatFecha("no-es-fecha")).toBe("no-es-fecha");
  });
});
