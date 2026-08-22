import { describe, expect, it } from "vitest";
import { normalizeMefRows, avancePct } from "../ingest/normalize.js";
import { CONFIRMED_MEF_FIELD_MAPPING } from "../ingest/field-mapping.js";

const mapping = CONFIRMED_MEF_FIELD_MAPPING;

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    SEC_EJEC: "001",
    EJECUTORA_NOMBRE: "Municipalidad de Ejemplo",
    NIVEL_GOBIERNO_NOMBRE: "Locales",
    FUNCION_NOMBRE: "Educación",
    DEPARTAMENTO_EJECUTORA: "15",
    DEPARTAMENTO_EJECUTORA_NOMBRE: "LIMA",
    PROVINCIA_EJECUTORA: "01",
    PROVINCIA_EJECUTORA_NOMBRE: "LIMA",
    DISTRITO_EJECUTORA: "01",
    DISTRITO_EJECUTORA_NOMBRE: "LIMA",
    DEPARTAMENTO_META_NOMBRE: "LIMA",
    ANO_EJE: "2025",
    MONTO_PIA: "1000000",
    MONTO_PIM: "1200000",
    MONTO_DEVENGADO: "900000",
    ...overrides,
  };
}

describe("normalizeMefRows", () => {
  it("returns empty when no rows are passed", () => {
    const result = normalizeMefRows([], mapping);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row into the canonical model, deriving ubigeo", () => {
    const { rows, rejected } = normalizeMefRows([rawRow()], mapping);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityCode: "001",
      entityName: "Municipalidad de Ejemplo",
      nivelGobierno: "Locales",
      funcion: "Educación",
      ubigeo: "150101",
      anioFiscal: 2025,
      pia: 1000000,
      pim: 1200000,
      devengado: 900000,
    });
  });

  it("aggregates multiple classifier-level rows for the same entity+funcion+year", () => {
    // El CSV real trae una fila por línea de clasificador de gasto (específica),
    // no una fila por entidad-año. Deben sumarse, no descartarse como duplicado.
    const rows = [
      rawRow({ MONTO_PIA: "500000", MONTO_PIM: "600000", MONTO_DEVENGADO: "400000" }),
      rawRow({ MONTO_PIA: "500000", MONTO_PIM: "600000", MONTO_DEVENGADO: "300000" }),
    ];
    const { rows: result, rejected } = normalizeMefRows(rows, mapping);
    expect(rejected).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pia: 1000000, pim: 1200000, devengado: 700000 });
  });

  it("returns null ubigeo instead of throwing when territory codes are missing", () => {
    const { rows } = normalizeMefRows([rawRow({ DEPARTAMENTO_EJECUTORA: "" })], mapping);
    expect(rows[0].ubigeo).toBeNull();
  });

  it("rejects rows with missing entity code instead of throwing", () => {
    const { rows, rejected } = normalizeMefRows([rawRow({ SEC_EJEC: "" })], mapping);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/entity_code/);
  });

  it("rejects rows with non-numeric monetary fields", () => {
    const { rejected } = normalizeMefRows([rawRow({ MONTO_PIA: "no-numero" })], mapping);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/PIA\/PIM\/devengado/);
  });

  it("rejects the aggregated group when devengado wildly exceeds pim (likely bad data)", () => {
    const { rows, rejected } = normalizeMefRows(
      [rawRow({ MONTO_PIM: "1000", MONTO_DEVENGADO: "5000" })],
      mapping
    );
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/devengado agregado excede PIM/);
  });

  it("falls back to entity code as name when the name field is blank", () => {
    const { rows } = normalizeMefRows([rawRow({ EJECUTORA_NOMBRE: "" })], mapping);
    expect(rows[0].entityName).toBe("001");
  });

  it("captures generica/genericaNombre on the canonical row (ADR-0006 Decisión 1)", () => {
    const { rows } = normalizeMefRows(
      [rawRow({ GENERICA: "2.1", GENERICA_NOMBRE: "PERSONAL Y OBLIGACIONES SOCIALES" })],
      mapping
    );
    expect(rows[0].generica).toBe("2.1");
    expect(rows[0].genericaNombre).toBe("PERSONAL Y OBLIGACIONES SOCIALES");
  });

  it("does NOT aggregate rows with different generica under the same entidad+función+año", () => {
    // Antes de ADR-0006 Decisión 1 estas dos filas se sumaban en una sola —
    // eso mezclaba planilla con inversión bajo el mismo total, perdiendo
    // justo la desagregación que se busca.
    const rows = [
      rawRow({ GENERICA: "2.1", GENERICA_NOMBRE: "PERSONAL Y OBLIGACIONES SOCIALES", MONTO_DEVENGADO: "400000" }),
      rawRow({ GENERICA: "2.6", GENERICA_NOMBRE: "ADQUISICION DE ACTIVOS NO FINANCIEROS", MONTO_DEVENGADO: "300000" }),
    ];
    const { rows: result, rejected } = normalizeMefRows(rows, mapping);
    expect(rejected).toHaveLength(0);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.generica === "2.1")?.devengado).toBe(400000);
    expect(result.find((r) => r.generica === "2.6")?.devengado).toBe(300000);
  });

  it("treats missing generica as null, not as a string, and still aggregates rows that both lack it", () => {
    const rows = [rawRow({ MONTO_DEVENGADO: "100" }), rawRow({ MONTO_DEVENGADO: "200" })];
    const { rows: result } = normalizeMefRows(rows, mapping);
    expect(result).toHaveLength(1);
    expect(result[0].generica).toBeNull();
    expect(result[0].devengado).toBe(300);
  });
});

describe("avancePct", () => {
  it("computes percentage of devengado over pim", () => {
    expect(avancePct({ pim: 1000, devengado: 250 })).toBe(25);
  });

  it("returns null when pim is zero to avoid division by zero", () => {
    expect(avancePct({ pim: 0, devengado: 100 })).toBeNull();
  });
});
