import { describe, expect, it } from "vitest";
import { normalizeResiduos } from "../ingest/normalize.js";

describe("normalizeResiduos", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 (Amazonas, departamento 01 — pierde el cero inicial en la fuente).
    return {
      FECHA_CORTE: "18122025",
      UBIGEO: "10101",
      ANIO: "2024",
      DEPARTAMENTO: "AMAZONAS",
      PROVINCIA: "CHACHAPOYAS",
      DISTRITO: "CHACHAPOYAS",
      REGION_NATURAL: "SELVA",
      TIPO_MUNICIPALIDAD: "PROVINCIAL",
      POB_TOTAL_INEI: "41335",
      POB_URBANA_INEI: "40358",
      POB_RURAL_INEI: "977",
      CLASIFICACION_MUNICIPAL_MEF: "A",
      GENERACION_PER_CAPITA_DOM: "0.50",
      GENERACION_DOM_URBANA_TDIA: "20.18",
      "GENERACION_DOM URBANA_TANIO": "7365.34",
      GENERACION_MUN_TANIO: "10521.91",
      GENERACION_MUN_TDIA: "28.83",
      GENERACION_PER_CAPITA_MUNICIPAL: "0.71",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeResiduos([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, padding ubigeo and parsing DDMMYYYY dates", () => {
    const { rows, rejected } = normalizeResiduos([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      ubigeo: "010101",
      anio: 2024,
      departamento: "AMAZONAS",
      poblacionTotal: 41335,
      generacionPercapitaDom: 0.5,
      generacionDomUrbanaTanio: 7365.34,
      fechaCorte: "2025-12-18",
    });
  });

  it("does not pad an already 6-digit ubigeo (La Libertad, departamento 13)", () => {
    const { rows } = normalizeResiduos([realRow({ UBIGEO: "130101", DEPARTAMENTO: "LA LIBERTAD" })]);
    expect(rows[0].ubigeo).toBe("130101");
  });

  it("rejects a row with an invalid ubigeo instead of throwing", () => {
    const { rows, rejected } = normalizeResiduos([realRow({ UBIGEO: "abc" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/UBIGEO/);
  });

  it("rejects a row missing ANIO instead of throwing", () => {
    const { rows, rejected } = normalizeResiduos([realRow({ ANIO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/ANIO/);
  });

  it("rejects a row missing DEPARTAMENTO/PROVINCIA/DISTRITO instead of throwing", () => {
    const { rows, rejected } = normalizeResiduos([realRow({ DISTRITO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/DEPARTAMENTO/);
  });

  it("returns null fechaCorte instead of throwing when unparseable", () => {
    const { rows } = normalizeResiduos([realRow({ FECHA_CORTE: "no-es-fecha" })]);
    expect(rows[0].fechaCorte).toBeNull();
  });

  it("detects AAAAMMDD format when DDMMAAAA would be an invalid calendar date", () => {
    // Fila real de la ingesta 2026-09-06: "20240410" interpretado ingenuamente como DDMMAAAA
    // da mes 24 (inválido) — el formato real de esta fila es AAAAMMDD (2024-04-10).
    const { rows } = normalizeResiduos([realRow({ FECHA_CORTE: "20240410" })]);
    expect(rows[0].fechaCorte).toBe("2024-04-10");
  });

  it("still detects DDMMAAAA when the first 4 digits also look like a plausible year", () => {
    // "20122025" (20 dic 2025, DDMMAAAA) tiene primeros 4 dígitos "2012" — también un año
    // plausible — pero leído como AAAAMMDD da mes 20 (inválido), así que debe recaer en DDMMAAAA.
    const { rows } = normalizeResiduos([realRow({ FECHA_CORTE: "20122025" })]);
    expect(rows[0].fechaCorte).toBe("2025-12-20");
  });

  it("returns null numeric fields instead of throwing when non-numeric", () => {
    const { rows } = normalizeResiduos([realRow({ POB_TOTAL_INEI: "", GENERACION_PER_CAPITA_DOM: "" })]);
    expect(rows[0].poblacionTotal).toBeNull();
    expect(rows[0].generacionPercapitaDom).toBeNull();
  });
});
