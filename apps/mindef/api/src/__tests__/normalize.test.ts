import { describe, expect, it } from "vitest";
import { normalizeOffsetAgreements, normalizeTrainingAbroad, normalizePeaceMissions } from "../ingest/normalize.js";

describe("normalizeOffsetAgreements", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      "TIPO DE CONVENIO": "Compensaciones Industriales y Sociales Offset",
      INSTITUCION: "Ministerio de Defensa",
      TITULO: "Transferencia de tecnología para simulador de vuelo",
      "ENTIDAD CONTRAPARTE": "Textron Aviation",
      OBSERVACION: "En ejecución",
      "AÑO INICIO": 2024,
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeOffsetAgreements([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row", () => {
    const { rows, rejected } = normalizeOffsetAgreements([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      tipoConvenio: "Compensaciones Industriales y Sociales Offset",
      institucion: "Ministerio de Defensa",
      entidadContraparte: "Textron Aviation",
      anioInicio: 2024,
    });
  });

  it("rejects a row missing INSTITUCION instead of throwing", () => {
    const { rows, rejected } = normalizeOffsetAgreements([realRow({ INSTITUCION: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/INSTITUCION/);
  });

  it("returns null for a blank AÑO INICIO instead of throwing", () => {
    const { rows } = normalizeOffsetAgreements([realRow({ "AÑO INICIO": "" })]);
    expect(rows[0].anioInicio).toBeNull();
  });
});

describe("normalizeTrainingAbroad", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      INSTITUCIÓN: "CENTRO SUPERIOR DE ESTUDIOS DE LA DEFENSA NACIONAL DE ESPAÑA",
      CAPACITACIÓN: "XXIV CURSO DE ALTO ESTUDIOS ESTRATÉGICOS",
      "PERSONAL MILITAR O CIVIL": 2,
      INICIO: new Date("2026-05-11T00:00:00.000Z"),
      TERMINO: new Date("2026-06-26T00:00:00.000Z"),
      PAÍS: "ESPAÑA",
      ...overrides,
    };
  }

  it("normalizes a well-formed row, converting ExcelJS Date cells to date-only strings", () => {
    const { rows, rejected } = normalizeTrainingAbroad([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      institucion: "CENTRO SUPERIOR DE ESTUDIOS DE LA DEFENSA NACIONAL DE ESPAÑA",
      personalCantidad: 2,
      fechaInicio: "2026-05-11",
      fechaTermino: "2026-06-26",
      pais: "ESPAÑA",
    });
  });

  it("rejects a row with a non-numeric PERSONAL MILITAR O CIVIL instead of throwing", () => {
    const { rows, rejected } = normalizeTrainingAbroad([realRow({ "PERSONAL MILITAR O CIVIL": "N/A" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/PERSONAL MILITAR O CIVIL/);
  });

  it("returns null for a missing TERMINO instead of throwing", () => {
    const { rows } = normalizeTrainingAbroad([realRow({ TERMINO: undefined })]);
    expect(rows[0].fechaTermino).toBeNull();
  });
});

describe("normalizePeaceMissions", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      MISION: "Misión Multidimensional Integrada de Estabilización de las Naciones Unidas en la República Centroafricana (MINUSCA)",
      MODALIDAD: "Oficial de Estado Mayor",
      INSTITUCION: "Ejército del Perú (EP)",
      PAIS: "República Centroafricana",
      AÑO: "2025",
      CANTIDAD: "1",
      ...overrides,
    };
  }

  it("normalizes a well-formed row, parsing numeric text fields", () => {
    const { rows, rejected } = normalizePeaceMissions([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({ anio: 2025, cantidad: 1, pais: "República Centroafricana" });
  });

  it("rejects a row with non-numeric CANTIDAD instead of throwing", () => {
    const { rows, rejected } = normalizePeaceMissions([realRow({ CANTIDAD: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/CANTIDAD/);
  });

  it("rejects a row missing MISION instead of throwing", () => {
    const { rows, rejected } = normalizePeaceMissions([realRow({ MISION: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/MISION/);
  });
});
