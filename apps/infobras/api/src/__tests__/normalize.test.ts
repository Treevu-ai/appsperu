import { describe, expect, it } from "vitest";
import { COL } from "../ingest/columns.js";
import {
  normalizeInfobrasRows,
  parseIntOrNull,
  parseSiNoBoolean,
  parseSpaceDecimalNumber,
} from "../ingest/normalize.js";

const COLUMN_COUNT = 97;

function realRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(COLUMN_COUNT).fill("");
  row[COL.codigoEntidad] = "0608";
  row[COL.entidadNombre] = "PROYECTO ESPECIAL CHAVIMOCHIC";
  row[COL.codigoInfobras] = "6";
  row[COL.nombreObra] = "CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU";
  row[COL.modalidadEjecucion] = "Contrata";
  row[COL.naturalezaObra] = "Construcción/Creación";
  row[COL.estadoEjecucion] = "En Ejecución";
  row[COL.nivelGobierno] = "GOBIERNO REGIONAL";
  row[COL.departamento] = "LA LIBERTAD";
  row[COL.provincia] = "VIRU";
  row[COL.distrito] = "VIRU";
  row[COL.montoViable] = "2740900";
  row[COL.costoActualizado] = "0";
  row[COL.costoExpedienteTecnico] = "1205287 56";
  row[COL.existeParalizacion] = "No";
  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value;
  }
  return row;
}

describe("parseSpaceDecimalNumber", () => {
  it("parses a plain integer with no space", () => {
    expect(parseSpaceDecimalNumber("2740900")).toBe(2740900);
  });

  it("parses the real space-as-decimal format", () => {
    expect(parseSpaceDecimalNumber("1205287 56")).toBe(1205287.56);
  });

  it("returns null for an empty or missing value", () => {
    expect(parseSpaceDecimalNumber("")).toBeNull();
    expect(parseSpaceDecimalNumber(undefined)).toBeNull();
  });

  it("returns null for an unrecognized pattern instead of guessing", () => {
    expect(parseSpaceDecimalNumber("1,205,287.56")).toBeNull();
    expect(parseSpaceDecimalNumber("no es un número")).toBeNull();
    expect(parseSpaceDecimalNumber("1 205 287")).toBeNull();
  });
});

describe("parseSiNoBoolean", () => {
  it("treats SI (any case) as true", () => {
    expect(parseSiNoBoolean("SI")).toBe(true);
    expect(parseSiNoBoolean("Si")).toBe(true);
  });

  it("treats anything else, including NO and empty, as false", () => {
    expect(parseSiNoBoolean("No")).toBe(false);
    expect(parseSiNoBoolean("")).toBe(false);
    expect(parseSiNoBoolean(undefined)).toBe(false);
  });
});

describe("parseIntOrNull", () => {
  it("parses a plain integer", () => {
    expect(parseIntOrNull("45")).toBe(45);
  });

  it("returns null for empty or non-numeric values", () => {
    expect(parseIntOrNull("")).toBeNull();
    expect(parseIntOrNull("45 dias")).toBeNull();
  });
});

describe("normalizeInfobrasRows", () => {
  it("returns empty when no rows are passed", () => {
    const result = normalizeInfobrasRows([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed real row (Chavimochic)", () => {
    const { rows, rejected } = normalizeInfobrasRows([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      codigoInfobras: "6",
      codigoEntidad: "0608",
      entidadNombre: "PROYECTO ESPECIAL CHAVIMOCHIC",
      nombreObra: "CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU",
      departamento: "LA LIBERTAD",
      montoViable: 2740900,
      costoExpedienteTecnico: 1205287.56,
      existeParalizacion: false,
    });
  });

  it("rejects a row missing codigo Infobras", () => {
    const { rows, rejected } = normalizeInfobrasRows([realRow({ [COL.codigoInfobras]: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/faltan campos requeridos/);
  });

  it("rejects a row missing departamento", () => {
    const { rows, rejected } = normalizeInfobrasRows([realRow({ [COL.departamento]: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/faltan campos requeridos/);
  });

  it("rejects a row with an unparseable numeric field instead of guessing", () => {
    const { rows, rejected } = normalizeInfobrasRows([realRow({ [COL.montoViable]: "S/ 2,740,900.00" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/Monto Viable\/Aprobado/);
  });

  it("parses Existe Paralización = SI along with its detail fields", () => {
    const { rows } = normalizeInfobrasRows([
      realRow({
        [COL.existeParalizacion]: "Si",
        [COL.causalParalizacion]: "Falta de disponibilidad presupuestal",
        [COL.fechaParalizacion]: "15/03/2025",
        [COL.diasParalizado]: "120",
      }),
    ]);
    expect(rows[0]).toMatchObject({
      existeParalizacion: true,
      causalParalizacion: "Falta de disponibilidad presupuestal",
      fechaParalizacion: "2025-03-15",
      diasParalizado: 120,
    });
  });
});
