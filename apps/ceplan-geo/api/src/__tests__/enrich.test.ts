import { describe, expect, it } from "vitest";
import { crossrefEnvelope, enrichWithTerritory } from "../crossref/enrich.js";

describe("crossref enrich", () => {
  it("wraps crossref metadata", () => {
    const body = crossrefEnvelope({
      matcher: "territorio_nombre",
      cobertura: "PARCIAL",
      restriccion: "sin coordenadas",
      dependencias: [{ app: "infobras", url: "http://localhost:4003", ok: true }],
      resultados: [],
    });

    expect(body.matcher).toBe("territorio_nombre");
    expect(body.cobertura).toBe("PARCIAL");
    expect(body.corte).toBeTruthy();
  });

  it("marks sin_match with explicit restriction", () => {
    const row = enrichWithTerritory({
      territory: null,
      matchStatus: "sin_match",
      payload: { obra: { nombreObra: "Escuela" } },
    });

    expect(row.matcher).toBe("sin_match");
    expect(row.territorio).toBeNull();
    expect(row.restriccion).toMatch(/UBIGEO/);
  });
});
