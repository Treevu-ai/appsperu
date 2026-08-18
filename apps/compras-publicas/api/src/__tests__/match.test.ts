import { describe, expect, it } from "vitest";
import { matchEntities } from "../crossref/match.js";

describe("matchEntities", () => {
  it("matches identical normalized names as confirmada with score 1", () => {
    const result = matchEntities(
      [{ entityCode: "001", nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" }],
      [{ buyerId: "PE-1", buyerName: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" }]
    );
    expect(result).toEqual([
      {
        mefEntityCode: "001",
        mefNombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
        oeceBuyerId: "PE-1",
        oeceBuyerName: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
        confidence: "confirmada",
        score: 1,
      },
    ]);
  });

  it("matches near-identical names (extra suffix) as candidata, not confirmada", () => {
    const result = matchEntities(
      [{ entityCode: "002", nombre: "MUNICIPALIDAD DISTRITAL DE EL PORVENIR" }],
      [{ buyerId: "PE-2", buyerName: "MUNICIPALIDAD DISTRITAL DE EL PORVENIR - TRUJILLO" }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("candidata");
    expect(result[0].mefEntityCode).toBe("002");
  });

  it("does NOT match two different places that only share generic administrative words", () => {
    // Caso real detectado en producción: Chilia y Agallpampa son distritos
    // distintos: "MUNICIPALIDAD DISTRITAL DE" es la única coincidencia.
    const result = matchEntities(
      [{ entityCode: "003", nombre: "MUNICIPALIDAD DISTRITAL DE AGALLPAMPA" }],
      [{ buyerId: "PE-3", buyerName: "MUNICIPALIDAD DISTRITAL DE CHILIA" }]
    );
    expect(result).toHaveLength(0);
  });

  it("does not match an entity by its type words alone across different institutions", () => {
    const result = matchEntities(
      [{ entityCode: "004", nombre: "GOB. REG. DE LA LIBERTAD - EDUCACION TRUJILLO NOR OESTE" }],
      [{ buyerId: "PE-4", buyerName: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" }]
    );
    expect(result).toHaveLength(0);
  });

  it("returns no match when nothing meets the candidate threshold", () => {
    const result = matchEntities(
      [{ entityCode: "005", nombre: "MUNICIPALIDAD DISTRITAL DE SARIN" }],
      [{ buyerId: "PE-5", buyerName: "UNIVERSIDAD NACIONAL DE TRUJILLO" }]
    );
    expect(result).toHaveLength(0);
  });

  it("picks the best-scoring MEF entity when multiple could plausibly match", () => {
    const result = matchEntities(
      [
        { entityCode: "006", nombre: "REGION LA LIBERTAD-SALUD TRUJILLO SUR OESTE" },
        { entityCode: "007", nombre: "REGION LA LIBERTAD-SALUD" },
      ],
      [{ buyerId: "PE-6", buyerName: "GOBIERNO REGIONAL DE LA LIBERTAD - U.E. 403-SALUD TRUJILLO-SUR OESTE" }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].mefEntityCode).toBe("006");
  });

  it("handles empty inputs without throwing", () => {
    expect(matchEntities([], [])).toEqual([]);
    expect(matchEntities([{ entityCode: "1", nombre: "X" }], [])).toEqual([]);
    expect(matchEntities([], [{ buyerId: "1", buyerName: "X" }])).toEqual([]);
  });
});
