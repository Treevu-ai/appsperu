import { describe, expect, it } from "vitest";
import { isRejected, normalizeRow, type RawWageRow } from "../ingest/normalize.js";

// Filas reales del CSV descargado en vivo el 2026-08-21 (ver ADR-0008).
const LA_LIBERTAD_2020: RawWageRow = {
  Región: "La Libertad",
  Año: "2020",
  Ene: "38.00",
  Feb: "-",
  Mar: "-",
  Abr: "-",
  May: "-",
  Jun: "-",
  Jul: "35.00",
  Ago: "30.00",
  Set: "38.00",
  Oct: "38.00",
  Nov: "40.00",
  Dic: "40.00",
};

const LA_LIBERTAD_2026: RawWageRow = {
  Región: "La Libertad",
  Año: "2026",
  Ene: "48.00",
  Feb: "48.76",
  Mar: "",
  Abr: "",
  May: "",
  Jun: "",
  Jul: "",
  Ago: "",
  Set: "",
  Oct: "",
  Nov: "",
  Dic: "",
};

describe("normalizeRow", () => {
  it("aplana una fila (Región, Año, Ene..Dic) en 12 filas mensuales", () => {
    const result = normalizeRow(LA_LIBERTAD_2020);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ departamento: "LA LIBERTAD", anio: 2020, mes: 1, valorSoles: 38 });
  });

  it("normaliza '-' (mes reportado sin dato) a null", () => {
    const result = normalizeRow(LA_LIBERTAD_2020);
    // Feb (mes 2) a Jun (mes 6) vienen "-" en la fila real de La Libertad 2020.
    for (let mes = 2; mes <= 6; mes++) {
      expect(result[mes - 1].valorSoles).toBeNull();
    }
    expect(result[6].valorSoles).toBe(35); // Jul, primer mes con dato tras el hueco
  });

  it("normaliza campo vacío (mes futuro sin reportar) a null, distinto de '-' pero mismo resultado", () => {
    const result = normalizeRow(LA_LIBERTAD_2026);
    expect(result[0]).toEqual({ departamento: "LA LIBERTAD", anio: 2026, mes: 1, valorSoles: 48 });
    expect(result[1].valorSoles).toBe(48.76);
    for (let mes = 3; mes <= 12; mes++) {
      expect(result[mes - 1].valorSoles).toBeNull();
    }
  });

  it("normaliza el departamento a mayúsculas para calzar con radar-ejecucion", () => {
    const result = normalizeRow({ ...LA_LIBERTAD_2020, Región: "la libertad" });
    expect(result[0].departamento).toBe("LA LIBERTAD");
  });
});

describe("isRejected", () => {
  it("rechaza una fila sin región", () => {
    expect(isRejected({ ...LA_LIBERTAD_2020, Región: "" })).toBe(true);
  });

  it("rechaza una fila con año no numérico", () => {
    expect(isRejected({ ...LA_LIBERTAD_2020, Año: "abcd" })).toBe(true);
  });

  it("acepta una fila real válida", () => {
    expect(isRejected(LA_LIBERTAD_2020)).toBe(false);
  });
});
