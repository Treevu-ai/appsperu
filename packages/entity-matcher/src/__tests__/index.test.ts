import { describe, expect, it } from "vitest";
import { matchEntities } from "../index.js";

describe("matchEntities", () => {
  it("matches identical normalized names as confirmada with score 1", () => {
    const result = matchEntities(
      [{ id: "001", nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" }],
      [{ id: "PE-1", nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" }],
    );
    expect(result).toEqual([
      {
        a: { id: "001", nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" },
        b: { id: "PE-1", nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" },
        confidence: "confirmada",
        score: 1,
      },
    ]);
  });

  it("matches near-identical names (extra suffix) as candidata, not confirmada", () => {
    const result = matchEntities(
      [{ id: "002", nombre: "MUNICIPALIDAD DISTRITAL DE EL PORVENIR" }],
      [{ id: "PE-2", nombre: "MUNICIPALIDAD DISTRITAL DE EL PORVENIR - TRUJILLO" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("candidata");
    expect(result[0].a.id).toBe("002");
  });

  it("does NOT match two different places that only share generic administrative words (Chilia/Agallpampa regression)", () => {
    // Caso real detectado en producción: Chilia y Agallpampa son distritos
    // distintos: "MUNICIPALIDAD DISTRITAL DE" es la única coincidencia.
    const result = matchEntities(
      [{ id: "003", nombre: "MUNICIPALIDAD DISTRITAL DE AGALLPAMPA" }],
      [{ id: "PE-3", nombre: "MUNICIPALIDAD DISTRITAL DE CHILIA" }],
    );
    expect(result).toHaveLength(0);
  });

  it("does not match an entity by its type words alone across different institutions", () => {
    const result = matchEntities(
      [{ id: "004", nombre: "GOB. REG. DE LA LIBERTAD - EDUCACION TRUJILLO NOR OESTE" }],
      [{ id: "PE-4", nombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" }],
    );
    expect(result).toHaveLength(0);
  });

  it("returns no match when nothing meets the candidate threshold", () => {
    const result = matchEntities(
      [{ id: "005", nombre: "MUNICIPALIDAD DISTRITAL DE SARIN" }],
      [{ id: "PE-5", nombre: "UNIVERSIDAD NACIONAL DE TRUJILLO" }],
    );
    expect(result).toHaveLength(0);
  });

  it("picks the best-scoring A-side entity when multiple could plausibly match", () => {
    const result = matchEntities(
      [
        { id: "006", nombre: "REGION LA LIBERTAD-SALUD TRUJILLO SUR OESTE" },
        { id: "007", nombre: "REGION LA LIBERTAD-SALUD" },
      ],
      [{ id: "PE-6", nombre: "GOBIERNO REGIONAL DE LA LIBERTAD - U.E. 403-SALUD TRUJILLO-SUR OESTE" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].a.id).toBe("006");
  });

  it("handles empty inputs without throwing", () => {
    expect(matchEntities([], [])).toEqual([]);
    expect(matchEntities([{ id: "1", nombre: "X" }], [])).toEqual([]);
    expect(matchEntities([], [{ id: "1", nombre: "X" }])).toEqual([]);
  });
});
