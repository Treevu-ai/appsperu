import { describe, expect, it } from "vitest";
import { isRejected, normalizeRow, type RawPoliceReportRow } from "../ingest/normalize.js";

// Filas reales del CSV descargado en vivo el 2026-08-27 (SIDPOL, MININTER).
const AMAZONAS_ARAMANGO: RawPoliceReportRow = {
  ANIO: "2018",
  MES: "1",
  DPTO_HECHO_NEW: "AMAZONAS",
  PROV_HECHO: "BAGUA",
  DIST_HECHO: "ARAMANGO",
  UBIGEO_HECHO: "10202", // 5 dígitos en origen — dept 01 pierde el cero inicial
  P_MODALIDADES: "Otros",
  cantidad: "4",
};

const LA_LIBERTAD_TRUJILLO: RawPoliceReportRow = {
  ANIO: "2026",
  MES: "7",
  DPTO_HECHO_NEW: "LA LIBERTAD",
  PROV_HECHO: "TRUJILLO",
  DIST_HECHO: "TRUJILLO",
  UBIGEO_HECHO: "130101", // dept 13 — 6 dígitos completos, nunca pierde el cero
  P_MODALIDADES: "Robo",
  cantidad: "42",
};

describe("normalizeRow", () => {
  it("rellena UBIGEO_HECHO de 5 dígitos con un cero inicial (departamentos 01-09)", () => {
    const result = normalizeRow(AMAZONAS_ARAMANGO);
    expect(result.ubigeo).toBe("010202");
  });

  it("deja intacto un UBIGEO_HECHO de 6 dígitos (departamentos 10+, incluida La Libertad)", () => {
    const result = normalizeRow(LA_LIBERTAD_TRUJILLO);
    expect(result.ubigeo).toBe("130101");
  });

  it("normaliza departamento, provincia y distrito a mayúsculas", () => {
    const result = normalizeRow({ ...LA_LIBERTAD_TRUJILLO, DPTO_HECHO_NEW: "la libertad" });
    expect(result.departamento).toBe("LA LIBERTAD");
  });

  it("mapea anio, mes y cantidad a número", () => {
    const result = normalizeRow(LA_LIBERTAD_TRUJILLO);
    expect(result).toEqual({
      anio: 2026,
      mes: 7,
      departamento: "LA LIBERTAD",
      provincia: "TRUJILLO",
      distrito: "TRUJILLO",
      ubigeo: "130101",
      modalidad: "Robo",
      cantidad: 42,
    });
  });
});

describe("isRejected", () => {
  it("acepta una fila real válida", () => {
    expect(isRejected(LA_LIBERTAD_TRUJILLO)).toBe(false);
    expect(isRejected(AMAZONAS_ARAMANGO)).toBe(false);
  });

  it("rechaza una fila sin departamento", () => {
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, DPTO_HECHO_NEW: "" })).toBe(true);
  });

  it("rechaza un mes fuera de rango", () => {
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, MES: "13" })).toBe(true);
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, MES: "0" })).toBe(true);
  });

  it("rechaza una cantidad negativa o no numérica", () => {
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, cantidad: "-1" })).toBe(true);
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, cantidad: "abc" })).toBe(true);
  });

  it("rechaza un UBIGEO_HECHO con formato irreconocible", () => {
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, UBIGEO_HECHO: "13" })).toBe(true);
    expect(isRejected({ ...LA_LIBERTAD_TRUJILLO, UBIGEO_HECHO: "" })).toBe(true);
  });
});
