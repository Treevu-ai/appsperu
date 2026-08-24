import { describe, expect, it } from "vitest";
import { consolidarEstadoTemporal, vigenteEnFecha } from "../lib/temporal-status.js";

describe("vigenteEnFecha", () => {
  it("distingue adjudicación previa, dentro y posterior al periodo", () => {
    expect(vigenteEnFecha("2026-01-01", "2026-02-01", "2026-03-01")).toBe(false);
    expect(vigenteEnFecha("2026-02-15", "2026-02-01", "2026-03-01")).toBe(true);
    expect(vigenteEnFecha("2026-04-01", "2026-02-01", "2026-03-01")).toBe(false);
  });

  it("no convierte un periodo o fecha ausente en una conclusión", () => {
    expect(vigenteEnFecha(null, "2026-02-01", "2026-03-01")).toBe("NO_VERIFICABLE");
    expect(vigenteEnFecha("2026-02-15", null, "2026-03-01")).toBe("NO_VERIFICABLE");
  });

  it("acepta inhabilitación sin fecha final como vigente desde su inicio", () => {
    expect(vigenteEnFecha("2026-04-01", "2026-02-01", null)).toBe(true);
  });
});

describe("consolidarEstadoTemporal", () => {
  it("solo devuelve falso cuando todos los periodos son verificablemente falsos", () => {
    expect(consolidarEstadoTemporal([false, false])).toBe(false);
    expect(consolidarEstadoTemporal([false, "NO_VERIFICABLE"])).toBe("NO_VERIFICABLE");
  });
});
