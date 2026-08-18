import { describe, expect, it } from "vitest";
import { normalizeInvestmentRows } from "../ingest/normalize.js";

// Forma real observada el 2026-08-17 en una fila de muestra del CSV.
function realRow(overrides: Record<string, unknown> = {}) {
  return {
    NIVEL: "GL",
    SECTOR: "GOBIERNOS LOCALES",
    ENTIDAD: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
    CODIGO_UNICO: "2716769",
    CODIGO_SNIP: "2716769",
    NOMBRE_INVERSION: "MEJORAMIENTO DEL SERVICIO DE PROVISIÓN DE AGUA PARA RIEGO",
    SEC_EJEC: "300790",
    NOMBRE_UEP: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
    ESTADO: "ACTIVO",
    SITUACION: "VIABLE",
    MONTO_VIABLE: "1853953.5",
    COSTO_ACTUALIZADO: "1853953.5",
    DEPARTAMENTO: "CUSCO",
    PROVINCIA: "URUBAMBA",
    DISTRITO: "OLLANTAYTAMBO",
    UBIGEO: "080910",
    FUNCION: "SANEAMIENTO",
    TIPO_INVERSION: "PROYECTO DE INVERSION",
    FECHA_REGISTRO: "2022-01-05",
    FECHA_VIABILIDAD: "2022-03-10",
    ...overrides,
  };
}

describe("normalizeInvestmentRows", () => {
  it("returns empty when no rows are passed", () => {
    const result = normalizeInvestmentRows([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row into the canonical model", () => {
    const { rows, rejected } = normalizeInvestmentRows([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cui: "2716769",
      nombre: "MEJORAMIENTO DEL SERVICIO DE PROVISIÓN DE AGUA PARA RIEGO",
      secEjec: "300790",
      departamento: "CUSCO",
      provincia: "URUBAMBA",
      distrito: "OLLANTAYTAMBO",
      ubigeo: "080910",
      montoViable: 1853953.5,
      costoActualizado: 1853953.5,
    });
  });

  it("rejects rows with missing CUI instead of throwing", () => {
    const { rows, rejected } = normalizeInvestmentRows([realRow({ CODIGO_UNICO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/CUI/);
  });

  it("rejects rows with missing NOMBRE_INVERSION instead of throwing", () => {
    const { rejected } = normalizeInvestmentRows([realRow({ NOMBRE_INVERSION: "" })]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/NOMBRE_INVERSION/);
  });

  it("rejects duplicate CUIs within the same batch, keeping the first", () => {
    const { rows, rejected } = normalizeInvestmentRows([realRow(), realRow()]);
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicado/);
  });

  it("returns null for non-numeric monetary fields instead of throwing", () => {
    const { rows } = normalizeInvestmentRows([realRow({ MONTO_VIABLE: "no-numero" })]);
    expect(rows[0].montoViable).toBeNull();
  });

  it("returns null for optional text fields left blank", () => {
    const { rows } = normalizeInvestmentRows([realRow({ CODIGO_SNIP: "" })]);
    expect(rows[0].codigoSnip).toBeNull();
  });
});
