import { describe, expect, it } from "vitest";
import { mandatoLegalFromFuente } from "../entidad-normas.js";

describe("mandatoLegalFromFuente", () => {
  it("resuelve la entidad dueña de un app documentado en docs/normas/", () => {
    const legal = mandatoLegalFromFuente("radar-ejecucion / radar_ejecucion_sector_ficha");
    expect(legal).toEqual({ entidad: "MEF", url: expect.stringContaining("mef-rof.md") });
  });

  it("acepta fuente sin tool, solo el app", () => {
    expect(mandatoLegalFromFuente("infobras")).toEqual({
      entidad: "Contraloría General de la República",
      url: expect.stringContaining("contraloria-rof.md"),
    });
  });

  it("devuelve undefined para un app sin ROF documentado (ej. salud-institucional, score compuesto)", () => {
    expect(mandatoLegalFromFuente("salud-institucional / salud_institucional_score")).toBeUndefined();
  });

  it("devuelve undefined para una fuente vacía o irreconocible", () => {
    expect(mandatoLegalFromFuente("")).toBeUndefined();
    expect(mandatoLegalFromFuente("app-que-no-existe / tool")).toBeUndefined();
  });

  it("mapea ambas apps de un mismo dueño (ceplan-estrategico y ceplan-geo) a la misma ficha", () => {
    const a = mandatoLegalFromFuente("ceplan-estrategico / x");
    const b = mandatoLegalFromFuente("ceplan-geo / y");
    expect(a).toEqual(b);
    expect(a?.entidad).toBe("CEPLAN");
  });
});
