import { describe, expect, it } from "vitest";
import { normalizeDerechos, type EsriFeature } from "../ingest/normalize-ingemmet.js";

describe("normalizeDerechos", () => {
  // Feature real confirmada 2026-09-21 contra SERV_CATASTRO_MINERO/MapServer/0/query (GEO-01).
  function realFeature(overrides: Record<string, unknown> = {}): EsriFeature {
    return {
      attributes: {
        OBJECTID: 109172,
        CODIGOU: "010033716",
        FEC_DENU: 1451883600000,
        CONCESION: "HUACRACANCHA 04",
        TIT_CONCES: "MINERA YANACOCHA S.R.L.",
        HECTAGIS: 899.9835,
        ESTADO: "T",
        D_ESTADO: "D.M. Titulado D.L. 708",
        SUSTANCIA: "M",
        DEPA: "LA LIBERTAD",
        PROVI: "JULCAN / SANTIAGO DE CHUCO",
        DISTRI: "QUIRUVILCA / CALAMARCA",
        FECHA_ACTUALIZACION: 1790014185000,
        ...overrides,
      },
    };
  }

  it("normaliza una feature real", () => {
    const { rows, rejected } = normalizeDerechos([realFeature()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      objectid: 109172,
      codigou: "010033716",
      concesion: "HUACRACANCHA 04",
      titular: "MINERA YANACOCHA S.R.L.",
      hectareas: 899.9835,
      estado: "T",
      estadoDescripcion: "D.M. Titulado D.L. 708",
      sustancia: "M",
      departamento: "LA LIBERTAD",
      provincia: "JULCAN / SANTIAGO DE CHUCO",
      distrito: "QUIRUVILCA / CALAMARCA",
    });
  });

  it("convierte FEC_DENU (epoch ms) a fecha ISO, no texto crudo", () => {
    const { rows } = normalizeDerechos([realFeature()]);
    expect(rows[0].fechaDenuncio).toBe("2016-01-04");
  });

  it("convierte FECHA_ACTUALIZACION (epoch ms) a datetime ISO completo", () => {
    const { rows } = normalizeDerechos([realFeature()]);
    expect(rows[0].fechaActualizacion).toBe(new Date(1790014185000).toISOString());
  });

  it("rechaza una feature sin OBJECTID", () => {
    const { rows, rejected } = normalizeDerechos([realFeature({ OBJECTID: null })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/OBJECTID/);
  });

  it("rechaza una feature sin CODIGOU", () => {
    const { rows, rejected } = normalizeDerechos([realFeature({ CODIGOU: "" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/CODIGOU/);
  });

  it("trata fechas ausentes o inválidas como null, sin descartar la fila", () => {
    const { rows, rejected } = normalizeDerechos([realFeature({ FEC_DENU: null, FECHA_ACTUALIZACION: "no-es-epoch" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].fechaDenuncio).toBeNull();
    expect(rows[0].fechaActualizacion).toBeNull();
  });

  it("trata TIT_CONCES/CONCESION ausentes como null, no como error", () => {
    const feature = realFeature();
    delete (feature.attributes as Record<string, unknown>).TIT_CONCES;
    delete (feature.attributes as Record<string, unknown>).CONCESION;
    const { rows, rejected } = normalizeDerechos([feature]);
    expect(rejected).toEqual([]);
    expect(rows[0].titular).toBeNull();
    expect(rows[0].concesion).toBeNull();
  });

  it("maneja features sin geometría (returnGeometry=false) sin error -- no se lee SHAPE", () => {
    const { rows, rejected } = normalizeDerechos([realFeature()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).not.toHaveProperty("shape");
  });
});
