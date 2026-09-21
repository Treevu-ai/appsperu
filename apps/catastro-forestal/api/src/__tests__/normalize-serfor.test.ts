import { describe, expect, it } from "vitest";
import { normalizeTitulos } from "../ingest/normalize-serfor.js";

describe("normalizeTitulos", () => {
  // Fila real confirmada 2026-09-22 contra Modalidad_Acceso/MapServer/6/query (Concesiones_Forestales).
  function realFeature(overrides: Record<string, unknown> = {}) {
    return {
      attributes: {
        OBJECTID: 16850,
        FUENTE: "DGFFS-DICFFS",
        DOCREG: " ",
        FECREG: null,
        OBSERV: "RD N° 216-2013-OSINFOR-DSCFFS",
        ZONUTM: 18,
        ORIGEN: 5,
        TIPCON: 80204,
        CONTRA: "22-SAM/C-J-016-03",
        NOMDIS: "220602",
        NOMPRO: "2206",
        NOMDEP: "22",
        AUTFOR: 6,
        FECINI: 1045803600000,
        FECTER: 2308107600000,
        SITUAC: 1,
        SUPSIG: 29690.238,
        SUPAPR: 29690,
        DOCLEG: " ",
        FECLEG: null,
        ...overrides,
      },
    };
  }

  it("normaliza una fila real de Concesiones_Forestales", () => {
    const { rows, rejected } = normalizeTitulos([realFeature()], "modalidad_concesiones_forestales");
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      capa: "modalidad_concesiones_forestales",
      objectid: 16850,
      fuente: "DGFFS-DICFFS",
      docReg: null, // " " (solo espacios) se trata como vacío
      nomDis: "220602",
      nomPro: "2206",
      nomDep: "22",
      autFor: 6,
      situac: 1,
      supSig: 29690.238,
      supApr: 29690,
    });
  });

  it("convierte FECINI/FECTER de epoch ms a fecha YYYY-MM-DD", () => {
    const { rows } = normalizeTitulos([realFeature()], "modalidad_concesiones_forestales");
    expect(rows[0].fecIni).toBe("2003-02-21");
  });

  it("guarda TIPCON/CONTRA (específicos de Concesiones_Forestales) en atributosExtra, no se pierden", () => {
    const { rows } = normalizeTitulos([realFeature()], "modalidad_concesiones_forestales");
    expect(rows[0].atributosExtra).toMatchObject({ TIPCON: 80204, CONTRA: "22-SAM/C-J-016-03" });
  });

  it("rechaza una fila sin OBJECTID", () => {
    const feature = realFeature();
    delete (feature.attributes as Record<string, unknown>).OBJECTID;
    const { rows, rejected } = normalizeTitulos([feature], "modalidad_concesiones_forestales");
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/OBJECTID/);
  });

  it("no confunde campos de una capa distinta -- atributosExtra usa el mapeo propio de cada capa", () => {
    const feature = {
      attributes: {
        OBJECTID: 1,
        NOMBOS: "Bosque Local X",
        CATORD: 1,
        NOMDEP: "13",
      },
    };
    const { rows } = normalizeTitulos([feature], "ordenamiento_bosques_locales");
    expect(rows[0].atributosExtra).toMatchObject({ NOMBOS: "Bosque Local X", CATORD: 1 });
    // TIPCON no es un campo de esta capa -- no debería aparecer aunque existiera en el objeto.
    expect(rows[0].atributosExtra).not.toHaveProperty("TIPCON");
  });

  it("trata campos opcionales ausentes (FUENTE, SUPSIG) como null, no como error", () => {
    const feature = realFeature();
    delete (feature.attributes as Record<string, unknown>).FUENTE;
    delete (feature.attributes as Record<string, unknown>).SUPSIG;
    const { rows, rejected } = normalizeTitulos([feature], "modalidad_concesiones_forestales");
    expect(rejected).toEqual([]);
    expect(rows[0].fuente).toBeNull();
    expect(rows[0].supSig).toBeNull();
  });
});
