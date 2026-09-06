import { describe, expect, it } from "vitest";
import { normalizeInfracciones } from "../ingest/normalize.js";

describe("normalizeInfracciones", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 contra el RUIAS.
    return {
      TIPO_DOC: "R.U.C.",
      ID_DOC_ADMINISTRADO: "20109989992",
      NOMBRE_ADMINISTRADO: "COMPAÑIA MINERA AURIFERA SANTA ROSA S.A.",
      NOMBRE_UNIDAD_FISCALIZABLE: "Santa Rosa",
      SUBSECTOR_ECONOMICO: "Minería",
      DEPARTAMENTO: "La Libertad",
      PROVINCIA: "Santiago De Chuco",
      DISTRITO: "Angasmarca, Angasmarca, Mollebamba",
      NRO_EXPEDIENTE: "0637-2019-OEFA/DFAI/PAS",
      NRO_RD: "0216-2022-OEFA/DFAI",
      FECHA_RD: "20220228",
      FECHA_INICIO_SUP: "20181022",
      FECHA_FIN_SUP: "20181026",
      NRO_RD_MULTA: "-",
      FECHA_RD_MULTA: "-",
      DETALLE_INFRACCION: "El titular minero no realizó la estabilidad geoquímica...",
      NORMA_TIPIFICADORA: "Artículo 3º de la Ley N° 28090",
      TIPO_SANCION: "Multa",
      TIPO_INFRACCION: "Compromisos y/o normas ambientales simples",
      MEDIDA_DICTADA: "-",
      CANTIDAD_MULTA: "13170,43",
      CANTIDAD_INFRACCIONES: "13",
      MULTA_EXPEDIENTE: "28401,97",
      FECHA_CORTE: "20240430",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeInfracciones([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, converting comma decimals and YYYYMMDD dates", () => {
    const { rows, rejected } = normalizeInfracciones([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      nombreAdministrado: "COMPAÑIA MINERA AURIFERA SANTA ROSA S.A.",
      cantidadMulta: 13170.43,
      cantidadInfracciones: 13,
      fechaRd: "2022-02-28",
    });
  });

  it("treats the literal '-' as null instead of a string", () => {
    const { rows } = normalizeInfracciones([realRow()]);
    expect(rows[0].nroRdMulta).toBeNull();
    expect(rows[0].fechaRdMulta).toBeNull();
    expect(rows[0].medidaDictada).toBeNull();
  });

  it("masks id_doc_administrado only when tipo_doc is D.N.I.", () => {
    const rucRow = normalizeInfracciones([realRow()]).rows[0];
    expect(rucRow.idDocAdministrado).toBe("20109989992");
    expect(rucRow.idDocEnmascarado).toBe(false);

    const dniRow = normalizeInfracciones([realRow({ TIPO_DOC: "D.N.I.", ID_DOC_ADMINISTRADO: "45678912" })]).rows[0];
    expect(dniRow.idDocAdministrado).toBe("*****912");
    expect(dniRow.idDocEnmascarado).toBe(true);
  });

  it("rejects a row missing NOMBRE_ADMINISTRADO instead of throwing", () => {
    const { rows, rejected } = normalizeInfracciones([realRow({ NOMBRE_ADMINISTRADO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/NOMBRE_ADMINISTRADO/);
  });

  it("rejects a row missing NRO_EXPEDIENTE instead of throwing", () => {
    const { rows, rejected } = normalizeInfracciones([realRow({ NRO_EXPEDIENTE: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/NRO_EXPEDIENTE/);
  });

  it("computes distinct rowHash for two rows sharing the same expediente+RD but different detalle", () => {
    const rowA = normalizeInfracciones([realRow({ DETALLE_INFRACCION: "Infracción A" })]).rows[0];
    const rowB = normalizeInfracciones([realRow({ DETALLE_INFRACCION: "Infracción B" })]).rows[0];
    expect(rowA.rowHash).not.toBe(rowB.rowHash);
  });

  it("returns null for unparseable dates instead of throwing", () => {
    const { rows } = normalizeInfracciones([realRow({ FECHA_RD: "no-es-fecha" })]);
    expect(rows[0].fechaRd).toBeNull();
  });
});
