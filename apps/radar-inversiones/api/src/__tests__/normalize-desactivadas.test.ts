import { describe, expect, it } from "vitest";
import { normalizeDeactivatedInvestmentRows } from "../ingest/normalize-desactivadas.js";

// Forma real observada el 2026-09-06 en una fila de muestra de INVERSIONES_DESACTIVADAS.csv.
function realRow(overrides: Record<string, unknown> = {}) {
  return {
    NIVEL: "GN",
    SECTOR: "MINISTERIO PUBLICO",
    ENTIDAD: "MINISTERIO PUBLICO",
    CODIGO_UNICO: "",
    COD_SNIP: "93",
    NOMBRE_INVERSION: "EXPANSIÓN, DIVERSIFICIACIÓN Y DESCENTRALIZACIÓN DE LOS SERVICIOS DEL MINISTERIO PÚBLICO",
    NOM_UEP: "MINISTERIO PUBLICO-GERENCIA GENERAL",
    ESTADO: "DESACTIVADO PERMANENTE",
    SITUACION: "VIABLE",
    MONTO_VIABLE: "46050895",
    COSTO_ACTUALIZADO: "46050895",
    FECHA_REGISTRO: "2001-06-12",
    FECHA_VIABILIDAD: "2001-06-19",
    FUNCION: "ADMINISTRACION Y PLANEAMIENTO",
    TIPO_INVERSION: "PIP MAYOR (SNIP)",
    DEPARTAMENTO: "-MUL.DEP-",
    PROVINCIA: "- TODOS -",
    DISTRITO: "- TODOS -",
    UBIGEO: "990000",
    NUM_HABITANTES_BENEF: "1",
    ...overrides,
  };
}

describe("normalizeDeactivatedInvestmentRows", () => {
  it("returns empty when no rows are passed", () => {
    const result = normalizeDeactivatedInvestmentRows([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, reading COD_SNIP/NOM_UEP (not CODIGO_SNIP/NOMBRE_UEP)", () => {
    const { rows, rejected } = normalizeDeactivatedInvestmentRows([realRow({ CODIGO_UNICO: "2716769" })]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cui: "2716769",
      codigoSnip: "93",
      nombreUep: "MINISTERIO PUBLICO-GERENCIA GENERAL",
      estado: "DESACTIVADO PERMANENTE",
      situacion: "VIABLE",
      montoViable: 46050895,
      numHabitantesBenef: 1,
    });
  });

  it("rejects rows with missing CUI instead of throwing", () => {
    const { rows, rejected } = normalizeDeactivatedInvestmentRows([realRow()]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/CUI/);
  });

  it("rejects duplicate CUIs within the same batch, keeping the first", () => {
    const row = realRow({ CODIGO_UNICO: "999" });
    const { rows, rejected } = normalizeDeactivatedInvestmentRows([row, row]);
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicado/);
  });

  it("returns null for numHabitantesBenef when blank", () => {
    const { rows } = normalizeDeactivatedInvestmentRows([realRow({ CODIGO_UNICO: "1", NUM_HABITANTES_BENEF: "" })]);
    expect(rows[0].numHabitantesBenef).toBeNull();
  });
});
