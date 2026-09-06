import { describe, expect, it } from "vitest";
import { normalizeIntervenciones } from "../ingest/normalize.js";

describe("normalizeIntervenciones", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 (La Libertad, provincia Chepén).
    return {
      ID_INTERVENCION: "285",
      CODIGO_UNICO_INVERSION: "2468720",
      JERARQUIA: "RVD",
      CODIGO_RUTA: "LI-100",
      TRAYECTORIA: "EMP. PE-1N (DV. CHEPEN) - CHEPEN - TALAMBO - L.D. CAJAMARCA.",
      INICIO: "05+956",
      FINAL: "21+367",
      IDDPTO: "13",
      IDPROV: "1304",
      DEPARTAMENTO: "LA LIBERTAD",
      PROVINCIA: "CHEPEN",
      ESTADO: "MALO",
      SUPERFICIE: "TROCHA",
      " CONVENIO": "1059-2018-MTC/21",
      LONGITUD: "15.41",
      RESPONSABLE: "PROREGION",
      COMPONENTE: "PROREGION 1",
      "CORREDOR VIAL ALIMENTADOR": "CVA 10 CAJAMARCA - LA LIBERTAD I",
      NIVEL_INTERVENCION: "MEJORAMIENTO",
      TRAMO: "5",
      FECHA_CORTE: "20260630",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeIntervenciones([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, reading the space-padded column names correctly", () => {
    const { rows, rejected } = normalizeIntervenciones([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      codigoRuta: "LI-100",
      departamento: "LA LIBERTAD",
      provincia: "CHEPEN",
      convenio: "1059-2018-MTC/21",
      corredorVial: "CVA 10 CAJAMARCA - LA LIBERTAD I",
      longitudKm: 15.41,
      fechaCorte: "2026-06-30",
    });
  });

  it("treats the literal '-' as null instead of a string", () => {
    const { rows } = normalizeIntervenciones([realRow({ ESTADO: "-", " CONVENIO": "-" })]);
    expect(rows[0].estado).toBeNull();
    expect(rows[0].convenio).toBeNull();
  });

  it("rejects a row missing DEPARTAMENTO instead of throwing", () => {
    const { rows, rejected } = normalizeIntervenciones([realRow({ DEPARTAMENTO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/DEPARTAMENTO/);
  });

  it("rejects a row missing PROVINCIA instead of throwing", () => {
    const { rows, rejected } = normalizeIntervenciones([realRow({ PROVINCIA: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/PROVINCIA/);
  });

  it("computes distinct rowHash for rows differing only by tramo", () => {
    const rowA = normalizeIntervenciones([realRow({ TRAMO: "5" })]).rows[0];
    const rowB = normalizeIntervenciones([realRow({ TRAMO: "6" })]).rows[0];
    expect(rowA.rowHash).not.toBe(rowB.rowHash);
  });

  it("returns null longitudKm instead of throwing when non-numeric", () => {
    const { rows } = normalizeIntervenciones([realRow({ LONGITUD: "" })]);
    expect(rows[0].longitudKm).toBeNull();
  });
});
