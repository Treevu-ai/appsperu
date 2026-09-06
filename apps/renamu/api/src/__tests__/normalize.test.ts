import { describe, expect, it } from "vitest";
import {
  normalizeMunicipalidades,
  normalizeVehiculos,
  normalizeConectividad,
} from "../ingest/normalize.js";

describe("normalizeMunicipalidades", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      Año: "2024",
      idmunici: "010101",
      Ubigeo: "010101",
      Departamento: "AMAZONAS",
      Provincia: "CHACHAPOYAS",
      Distrito: "CHACHAPOYAS",
      Tipomuni: "1",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeMunicipalidades([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, preserving the leading zero in ubigeo", () => {
    const { rows, rejected } = normalizeMunicipalidades([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      anio: 2024,
      idmunici: "010101",
      ubigeo: "010101",
      tipomuni: "1",
    });
  });

  it("rejects a row with a ubigeo that is not 6 digits instead of throwing", () => {
    const { rows, rejected } = normalizeMunicipalidades([realRow({ Ubigeo: "101" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/Ubigeo/);
  });

  it("rejects a row with tipomuni outside 1/2/3 instead of throwing", () => {
    const { rows, rejected } = normalizeMunicipalidades([realRow({ Tipomuni: "9" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/Tipomuni/);
  });

  it("rejects a row missing idmunici instead of throwing", () => {
    const { rows, rejected } = normalizeMunicipalidades([realRow({ idmunici: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/idmunici/);
  });
});

describe("normalizeVehiculos", () => {
  it("includes an item with counts when the municipality answered 'Sí' (1)", () => {
    const raw = { P11A_1: "1", P11A_1_1: "12", P11A_1_2: "0" };
    const items = normalizeVehiculos(raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemCodigo: "P11A_1",
      itemDescripcion: "Auto y/o camioneta",
      tiene: true,
      cantidadOperativa: 12,
      cantidadNoOperativa: 0,
    });
  });

  it("includes an item with null counts when the municipality answered 'No' (2)", () => {
    // Fila real observada: cuando P11A_N = "2" las columnas de cantidad vienen en blanco.
    const raw = { P11A_3: "2", P11A_3_1: " ", P11A_3_2: " " };
    const items = normalizeVehiculos(raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ tiene: false, cantidadOperativa: null, cantidadNoOperativa: null });
  });

  it("skips an item the municipality never answered, instead of fabricating a value", () => {
    const items = normalizeVehiculos({});
    expect(items).toHaveLength(0);
  });

  it("only captures 'especifique' for the 'otro' item (P11A_10)", () => {
    const raw = { P11A_10: "1", P11A_10_1: "1", P11A_10_2: "0", P11A_10_O: "Cuatrimoto" };
    const items = normalizeVehiculos(raw);
    expect(items[0].especifique).toBe("Cuatrimoto");
  });
});

describe("normalizeConectividad", () => {
  it("normalizes a real row, keeping P14A_1 as the computer count and P14A_2 as the connection-type code", () => {
    // Fila real 2026-09-06: el diccionario en PDF sugiere el orden inverso — se
    // verificó contra filas reales del CSV que P14A_1 es la cantidad de
    // computadoras y P14A_2 es el código de tipo de conexión (1-5).
    const raw = { P12_1: "1", P12A_1: "1", P12_2: "1", P12A_2: "1", P14: "1", P14A_1: "135", P14A_2: "4" };
    const result = normalizeConectividad(raw);
    expect(result).toMatchObject({
      tieneLineaFija: true,
      lineasFijas: 1,
      tieneLineaMovil: true,
      lineasMoviles: 1,
      tieneInternet: true,
      computadorasConInternet: 135,
      tipoConexionCodigo: 4,
    });
  });

  it("returns null when the core Sí/No fields are missing instead of guessing", () => {
    expect(normalizeConectividad({})).toBeNull();
  });
});
