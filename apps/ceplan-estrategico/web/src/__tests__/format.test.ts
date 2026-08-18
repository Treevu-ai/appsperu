import { describe, expect, it } from "vitest";
import { formatAnio, formatFecha, formatPct, formatValor } from "@/lib/format";

describe("formatPct", () => {
  it("formats a number with one decimal and a percent sign", () => {
    expect(formatPct(76.6)).toBe("76.6%");
  });

  it("shows 'sin dato' for null", () => {
    expect(formatPct(null)).toBe("sin dato");
  });
});

describe("formatValor", () => {
  it("appends the unit of measure when present", () => {
    expect(formatValor(95, "%")).toBe("95 %");
  });

  it("omits the unit when null", () => {
    expect(formatValor(4, null)).toBe("4");
  });
});

describe("formatFecha", () => {
  it("formats an ISO date in es-PE medium style", () => {
    // Día a mitad de año — evita que el parseo UTC de una fecha sin hora
    // ruede al día/año anterior en zonas horarias detrás de UTC.
    expect(formatFecha("2024-06-15")).toMatch(/2024/);
  });

  it("returns the raw string when the date is invalid", () => {
    expect(formatFecha("no-es-fecha")).toBe("no-es-fecha");
  });
});

describe("formatAnio", () => {
  it("extracts the year from measurementDate", () => {
    expect(formatAnio("2024-01-01T05:00:00.000Z")).toBe("2024");
  });

  it("shows 'sin dato' for null", () => {
    expect(formatAnio(null)).toBe("sin dato");
  });
});
