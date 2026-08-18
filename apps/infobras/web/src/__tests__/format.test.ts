import { describe, expect, it } from "vitest";
import { formatFecha, formatPct, formatSoles } from "@/lib/format";

describe("formatSoles", () => {
  it("formats a number as PEN currency without decimals", () => {
    expect(formatSoles(1205287.56)).toContain("1,205,288");
  });

  it("renders an explicit placeholder for null instead of S/ 0", () => {
    expect(formatSoles(null)).toBe("sin dato");
  });
});

describe("formatPct", () => {
  it("formats a percentage with one decimal", () => {
    expect(formatPct(81.26)).toBe("81.3%");
  });

  it("renders an explicit placeholder for null instead of 0%", () => {
    expect(formatPct(null)).toBe("sin dato");
  });
});

describe("formatFecha", () => {
  it("formats an ISO date in es-PE medium style", () => {
    expect(formatFecha("2025-03-15")).toMatch(/2025/);
  });

  it("renders an explicit placeholder for a missing date", () => {
    expect(formatFecha(null)).toBe("sin fecha");
  });
});
