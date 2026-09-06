import { describe, expect, it } from "vitest";
import { matchEntitiesToInformes } from "../crossref/match.js";

describe("matchEntitiesToInformes", () => {
  it("matchea exacto tras normalizar, y conserva los conteos agregados (nunca nombres)", () => {
    const mef = [{ entityCode: "E1", nombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" }];
    const informes = [{ entidad: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO", totalInformes: 5, informesConResponsabilidad: 2 }];

    const matches = matchEntitiesToInformes(mef, informes);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      mefEntityCode: "E1",
      entidad: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
      totalInformes: 5,
      informesConResponsabilidad: 2,
      confidence: "confirmada",
    });
  });

  it("matchea candidata cuando el nombre difiere levemente, con score < 1", () => {
    const mef = [{ entityCode: "E2", nombre: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO" }];
    const informes = [{ entidad: "MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION", totalInformes: 1, informesConResponsabilidad: 0 }];

    const matches = matchEntitiesToInformes(mef, informes);

    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe("candidata");
    expect(matches[0].score).toBeLessThan(1);
  });

  it("no fuerza un match cuando los nombres no comparten ningún token distintivo", () => {
    const mef = [{ entityCode: "E3", nombre: "MUNICIPALIDAD DISTRITAL DE AGALLPAMPA" }];
    const informes = [{ entidad: "MUNICIPALIDAD DISTRITAL DE CHILIA", totalInformes: 1, informesConResponsabilidad: 0 }];

    expect(matchEntitiesToInformes(mef, informes)).toHaveLength(0);
  });

  it("devuelve un arreglo vacío si no hay entidades o informes que comparar", () => {
    expect(matchEntitiesToInformes([], [])).toEqual([]);
  });
});
