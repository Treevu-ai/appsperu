import { describe, expect, it } from "vitest";
import { normalizeCemCasos, normalizeChat100Consultas } from "../ingest/normalize.js";

// Encabezados reales observados el 2026-09-06 (Latin-1 decodificado) — nótese
// "N°" (signo de grado, U+00B0), no "Nº" (ordinal, U+00BA). Confundir los dos
// causó un bug real: todas las columnas numéricas quedaban NULL en silencio.
describe("normalizeCemCasos", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      "AÑO": "2025",
      PERIODO: "ENE - DIC",
      "CODIGO CENTRO ATENCION": "CEM001",
      "NOMBRE CENTRO ATENCION": "TRUJILLO",
      UBIGEO: "130101",
      DEPARTAMENTO: "LA LIBERTAD",
      PROVINCIA: "TRUJILLO",
      DISTRITO: "TRUJILLO",
      "N° CASOS ATENDIDOS-TOTAL": "340",
      "N° CASOS ATENDIDOS - HOMBRES - TOTAL": "87",
      "N° CASOS ATENDIDOS - MUJERES - TOTAL": "253",
      "N° CASOS ATENDIDOS - VIOLENCIA PSICOLOGICA": "180",
      "N° CASOS ATENDIDOS - VIOLENCIA FISICA": "100",
      "N° CASOS ATENDIDOS - VIOLENCIA SEXUAL": "40",
      "N° CASOS ATENDIDOS - VIOLENCIA ECONÓMICA O PATRIMONIAL": "20",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeCemCasos([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row using the real N° (degree sign) column names", () => {
    const { rows, rejected } = normalizeCemCasos([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      anioReporte: 2025,
      departamento: "LA LIBERTAD",
      casosTotal: 340,
      casosHombres: 87,
      casosMujeres: 253,
      casosViolenciaSexual: 40,
    });
  });

  it("rejects a row with an empty AÑO instead of throwing", () => {
    const { rows, rejected } = normalizeCemCasos([realRow({ "AÑO": "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/AÑO/);
  });

  it("rejects a duplicate (año, centro) within the same batch", () => {
    const row = realRow();
    const { rows, rejected } = normalizeCemCasos([row, row]);
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicada/);
  });

  it("does not silently return null for the real column name (regression for the N°/Nº bug)", () => {
    const { rows } = normalizeCemCasos([realRow()]);
    expect(rows[0].casosTotal).not.toBeNull();
  });
});

describe("normalizeChat100Consultas", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      "AÑO DEL REPORTE DE INFORMACION": "2021",
      "PERIODO DE LA INFORMACION REMITIDA": "ENE - DIC",
      "N° DE CONSULTAS -TOTAL": "5,910",
      "N° DE CONSULTAS - HOMBRES - TOTAL": "1,385",
      "N° DE CONSULTAS - MUJERES - TOTAL": "4,519",
      "N° DE CONSULTAS - NO ESPECIFICA SEXO - TOTAL": "6",
      ...overrides,
    };
  }

  it("normalizes a well-formed row, stripping thousands separators", () => {
    const { rows, rejected } = normalizeChat100Consultas([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({ anioReporte: 2021, consultasTotal: 5910, consultasHombres: 1385 });
  });

  it("rejects a duplicate año within the same batch", () => {
    const row = realRow();
    const { rows, rejected } = normalizeChat100Consultas([row, row]);
    expect(rows).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicado/);
  });

  it("rejects a row missing AÑO DEL REPORTE DE INFORMACION instead of throwing", () => {
    const { rows, rejected } = normalizeChat100Consultas([realRow({ "AÑO DEL REPORTE DE INFORMACION": "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/AÑO DEL REPORTE/);
  });
});
