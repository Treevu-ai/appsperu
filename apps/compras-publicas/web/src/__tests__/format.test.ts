import { describe, expect, it } from "vitest";
import { formatCategoria, formatFecha, formatSoles } from "@/lib/format";

describe("formatSoles", () => {
  it("formats a number as PEN currency without decimals", () => {
    expect(formatSoles(352698)).toContain("352,698");
  });

  it("renders an explicit placeholder for null instead of S/ 0", () => {
    expect(formatSoles(null)).toBe("sin dato");
  });
});

describe("formatFecha", () => {
  it("formats an ISO date in es-PE medium style", () => {
    expect(formatFecha("2026-08-12T16:38:00-05:00")).toMatch(/2026/);
  });

  it("renders an explicit placeholder for a missing date", () => {
    expect(formatFecha(null)).toBe("sin fecha");
  });

  it("returns the original string when the date is invalid", () => {
    expect(formatFecha("no-es-fecha")).toBe("no-es-fecha");
  });
});

describe("formatCategoria", () => {
  it("translates known OCDS categories to Spanish labels", () => {
    expect(formatCategoria("goods")).toBe("Bienes");
    expect(formatCategoria("works")).toBe("Obras");
    expect(formatCategoria("services")).toBe("Servicios");
  });

  it("falls back to the raw value for unknown categories", () => {
    expect(formatCategoria("mystery")).toBe("mystery");
  });

  it("renders an explicit placeholder when categoria is null", () => {
    expect(formatCategoria(null)).toBe("sin categoría");
  });
});
