import { describe, expect, it } from "vitest";
import { normalizeAutoridadesElectas } from "../ingest/normalize.js";

describe("normalizeAutoridadesElectas", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 contra el recurso "actual" del JNE
    // (autoridad proclamada, no candidata — TXPRONUNCIAMIENTO es un acta de
    // proclamación real).
    return {
      TXNOMBRES: "OSWAR ELBIS",
      TXAPELLIDOPATERNO: "CAHUAZA",
      TXAPELLIDOMATERNO: "MITIVIRE",
      TXORGANIZACIONPOLITICA: "JUNTOS POR EL PERU",
      NUPOSICION: 1,
      TXCARGO: "DIPUTADO",
      TXREGION: null,
      TXPROVINCIA: null,
      TXDISTRITO: null,
      FEINICIOVIGENCIA: new Date("2026-07-28T05:00:00.000Z"),
      FEFINVIGENCIA: new Date("2031-07-27T05:00:00.000Z"),
      UBIGEO: "250000",
      TXPROCESOELECTORAL: "ELECCIONES GENERALES 2026",
      TXANIOELECCION: "2026",
      TXPRONUNCIAMIENTO: "ACTA PROCLAMACIÓN N° 00001",
      FEPUBLICACION: new Date("2026-07-04T01:04:17.000Z"),
      TXAMBITO: "NACIONAL",
      TXGENERO: "M",
      NUEDAD: 51,
      TXPERIODO: "PERIODO 2026 - 2031",
      TXTIPOORGPOLITICA: "PARTIDOS POLITICOS",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeAutoridadesElectas([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, converting Date cells to date-only strings", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      nombres: "OSWAR ELBIS",
      apellidoPaterno: "CAHUAZA",
      cargo: "DIPUTADO",
      ubigeo: "250000",
      fechaInicioVigencia: "2026-07-28",
      ambito: "NACIONAL",
      genero: "M",
      anioEleccion: 2026,
    });
  });

  it("rejects a row missing TXNOMBRES instead of throwing", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow({ TXNOMBRES: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/TXNOMBRES/);
  });

  it("rejects a row missing TXCARGO instead of throwing", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow({ TXCARGO: null })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/TXCARGO/);
  });

  it("sets ubigeo to null instead of throwing when it is not 6 digits", () => {
    const { rows } = normalizeAutoridadesElectas([realRow({ UBIGEO: "25" })]);
    expect(rows[0].ubigeo).toBeNull();
  });

  it("sets ambito to null instead of throwing when it is an unrecognized value", () => {
    const { rows } = normalizeAutoridadesElectas([realRow({ TXAMBITO: "GALÁCTICO" })]);
    expect(rows[0].ambito).toBeNull();
  });

  it("normalizes a row with empty region/provincia/distrito (ámbito nacional)", () => {
    const { rows } = normalizeAutoridadesElectas([realRow()]);
    expect(rows[0].region).toBeNull();
    expect(rows[0].provincia).toBeNull();
    expect(rows[0].distrito).toBeNull();
  });

  it("rejects a row missing TXORGANIZACIONPOLITICA instead of throwing", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow({ TXORGANIZACIONPOLITICA: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/TXORGANIZACIONPOLITICA/);
  });

  it("rejects a row missing TXAPELLIDOPATERNO instead of throwing", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow({ TXAPELLIDOPATERNO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/TXAPELLIDOPATERNO/);
  });

  it("rejects a row missing TXPROCESOELECTORAL instead of throwing", () => {
    const { rows, rejected } = normalizeAutoridadesElectas([realRow({ TXPROCESOELECTORAL: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/TXPROCESOELECTORAL/);
  });

  it("sets genero to null instead of throwing when it is an unrecognized value", () => {
    const { rows } = normalizeAutoridadesElectas([realRow({ TXGENERO: "X" })]);
    expect(rows[0].genero).toBeNull();
  });

  it("parses date fields given as ISO strings, not just Date objects", () => {
    const { rows } = normalizeAutoridadesElectas([
      realRow({ FEINICIOVIGENCIA: "2026-07-28T05:00:00.000Z", FEPUBLICACION: "2026-07-04T01:04:17.000Z" }),
    ]);
    expect(rows[0].fechaInicioVigencia).toBe("2026-07-28");
    expect(rows[0].fechaPublicacion).toBe("2026-07-04T01:04:17.000Z");
  });

  it("returns null date fields instead of throwing when they are absent or unparseable", () => {
    const { rows } = normalizeAutoridadesElectas([
      realRow({ FEINICIOVIGENCIA: null, FEFINVIGENCIA: "no es una fecha", FEPUBLICACION: undefined }),
    ]);
    expect(rows[0].fechaInicioVigencia).toBeNull();
    expect(rows[0].fechaFinVigencia).toBeNull();
    expect(rows[0].fechaPublicacion).toBeNull();
  });

  it("returns null for posicion/anioEleccion/edad instead of throwing when non-numeric", () => {
    const { rows } = normalizeAutoridadesElectas([realRow({ NUPOSICION: "N/A", TXANIOELECCION: "", NUEDAD: null })]);
    expect(rows[0].posicion).toBeNull();
    expect(rows[0].anioEleccion).toBeNull();
    expect(rows[0].edad).toBeNull();
  });
});
