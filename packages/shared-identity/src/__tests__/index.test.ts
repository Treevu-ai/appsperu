import { describe, expect, it } from "vitest";
import { consolidarEstadoTemporal, extractRuc, vigenteEnFecha } from "../index.js";

describe("extractRuc", () => {
  it("extracts the 11-digit RUC from a PE-RUC- supplier id", () => {
    expect(extractRuc("PE-RUC-20610467122")).toBe("20610467122");
  });

  it("returns null for a consortium id without the PE-RUC- prefix", () => {
    expect(extractRuc("CONSORCIO-ABC123")).toBeNull();
  });

  it("returns null when the digits after the prefix are not exactly 11", () => {
    expect(extractRuc("PE-RUC-123")).toBeNull();
    expect(extractRuc("PE-RUC-123456789012")).toBeNull();
  });

  it("extracts the 11-digit RUC from a seace:ruc: supplier id (minor_contracts)", () => {
    expect(extractRuc("seace:ruc:20610467122")).toBe("20610467122");
  });
});

describe("vigenteEnFecha", () => {
  it("returns NO_VERIFICABLE when the reference date is missing", () => {
    expect(vigenteEnFecha(null, "2020-01-01", null)).toBe("NO_VERIFICABLE");
  });

  it("returns NO_VERIFICABLE when the start date is missing", () => {
    expect(vigenteEnFecha("2021-06-01", null, "2022-01-01")).toBe("NO_VERIFICABLE");
  });

  it("returns false when the reference date is before the start date", () => {
    expect(vigenteEnFecha("2019-01-01", "2020-01-01", "2022-01-01")).toBe(false);
  });

  it("returns true when the reference date falls within an open-ended range", () => {
    expect(vigenteEnFecha("2025-01-01", "2020-01-01", null)).toBe(true);
  });

  it("returns true when the reference date falls within a closed range", () => {
    expect(vigenteEnFecha("2021-01-01", "2020-01-01", "2022-01-01")).toBe(true);
  });

  it("returns false when the reference date is after the end date", () => {
    expect(vigenteEnFecha("2023-01-01", "2020-01-01", "2022-01-01")).toBe(false);
  });
});

describe("consolidarEstadoTemporal", () => {
  it("returns true if any state is true", () => {
    expect(consolidarEstadoTemporal([false, true, "NO_VERIFICABLE"])).toBe(true);
  });

  it("returns false only if every state is false", () => {
    expect(consolidarEstadoTemporal([false, false])).toBe(false);
  });

  it("returns NO_VERIFICABLE when the list is empty or mixes false with unverifiable", () => {
    expect(consolidarEstadoTemporal([])).toBe("NO_VERIFICABLE");
    expect(consolidarEstadoTemporal([false, "NO_VERIFICABLE"])).toBe("NO_VERIFICABLE");
  });
});
