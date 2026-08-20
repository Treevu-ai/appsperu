import { describe, expect, it } from "vitest";
import { matchEntitiesToPadron } from "../crossref/match.js";

describe("matchEntitiesToPadron", () => {
  it("matchea nombre idéntico como 'confirmada', score 1", () => {
    const result = matchEntitiesToPadron(
      [{ entityCode: "301140", nombre: "MUNICIPALIDAD PROVINCIAL DE ASCOPE" }],
      [{ ruc: "20187052221", razonSocial: "MUNICIPALIDAD PROVINCIAL DE ASCOPE" }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("confirmada");
    expect(result[0].score).toBe(1);
    expect(result[0].ruc).toBe("20187052221");
  });

  it("caso real: 'SANCHEZ CARRION - HUAMACHUCO' matchea contra el nombre oficial sin 'DE' ni sufijo, como 'candidata'", () => {
    // Caso real investigado el 2026-08-20 — ver docs/data-contracts/sunat-padron-ruc.md.
    // El matcher NO necesitó extenderse para resolver esto, solo reutilizarse.
    const result = matchEntitiesToPadron(
      [{ entityCode: "301189", nombre: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO" }],
      [{ ruc: "20141897935", razonSocial: "MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION" }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("candidata");
    expect(result[0].score).toBeCloseTo(0.8);
    expect(result[0].ruc).toBe("20141897935");
  });

  it("no fuerza un match cuando solo comparten palabras de tipo de entidad (falso positivo real ya visto en compras-publicas)", () => {
    const result = matchEntitiesToPadron(
      [{ entityCode: "301200", nombre: "MUNICIPALIDAD DISTRITAL DE AGALLPAMPA" }],
      [{ ruc: "20999999999", razonSocial: "MUNICIPALIDAD DISTRITAL DE CHILIA" }]
    );
    expect(result).toHaveLength(0);
  });

  it("no matchea si no hay ninguna entidad similar", () => {
    const result = matchEntitiesToPadron(
      [{ entityCode: "301999", nombre: "MUNICIPALIDAD DISTRITAL DE MOCHE" }],
      [{ ruc: "20111111111", razonSocial: "EMPRESA DE TRANSPORTES EL SOL S.A.C." }]
    );
    expect(result).toHaveLength(0);
  });
});
