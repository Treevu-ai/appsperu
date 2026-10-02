import { describe, expect, it } from "vitest";
import { metaNumber } from "../NumberWithMetadata.js";

describe("metaNumber", () => {
  it("deriva mandatoLegal automáticamente desde fuente cuando no se pasa explícito", () => {
    const data = metaNumber(100, "radar-ejecucion / radar_ejecucion_sector_ficha", "2026-08-26", "COMPLETA");
    expect(data.mandatoLegal).toEqual({ entidad: "MEF", url: expect.stringContaining("mef-rof.md") });
  });

  it("no agrega mandatoLegal cuando la fuente no tiene entidad documentada", () => {
    const data = metaNumber(100, "salud-institucional / salud_institucional_score", "2026-08-26", "COMPLETA");
    expect(data.mandatoLegal).toBeUndefined();
  });

  it("respeta un mandatoLegal explícito por sobre el derivado", () => {
    const explicito = { entidad: "Otra entidad", url: "https://ejemplo.test/otra.md" };
    const data = metaNumber(100, "radar-ejecucion / x", "2026-08-26", "COMPLETA", undefined, undefined, explicito);
    expect(data.mandatoLegal).toEqual(explicito);
  });

  it("permite suprimir la derivación automática pasando null a propósito", () => {
    const data = metaNumber(100, "radar-ejecucion / x", "2026-08-26", "COMPLETA", undefined, undefined, null);
    expect(data.mandatoLegal).toBeUndefined();
  });

  it("sigue funcionando sin el parámetro nuevo (compatibilidad con call sites existentes)", () => {
    const data = metaNumber(100, "buscar / x", "2026-08-26", "PARCIAL", "fuzzy", "cobertura parcial");
    expect(data.matcher).toBe("fuzzy");
    expect(data.restriccion).toBe("cobertura parcial");
    expect(data.mandatoLegal).toBeUndefined();
  });
});
