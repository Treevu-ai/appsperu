import { describe, expect, it } from "vitest";
import { parseOxiMontoSoles, parseOxiRow } from "../ingest/oxi-normalize.js";

describe("parseOxiMontoSoles", () => {
  it("convierte 'S/443,431.09' a 443431.09", () => {
    expect(parseOxiMontoSoles("S/443,431.09")).toBe(443431.09);
  });

  it("acepta el formato 'S/.' con punto", () => {
    expect(parseOxiMontoSoles("S/.6,784,469.84")).toBe(6784469.84);
  });

  it("retorna null para vacío o undefined", () => {
    expect(parseOxiMontoSoles("")).toBeNull();
    expect(parseOxiMontoSoles(undefined)).toBeNull();
    expect(parseOxiMontoSoles(null)).toBeNull();
  });

  it("retorna null para texto no numérico", () => {
    expect(parseOxiMontoSoles("no aplica")).toBeNull();
  });
});

describe("parseOxiRow", () => {
  const validRow = {
    B: "5893",
    C: "Priorizado",
    D: "Proyecto de inversión",
    E: "Ficha técnica",
    F: "Gobierno Local Provincial",
    G: "LA LIBERTAD",
    H: "TRUJILLO",
    I: "TRUJILLO",
    J: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
    K: "Enlace",
    L: "2698796",
    M: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
    N: "TRANSPORTE",
    O: "Vías Urbanas",
    P: "S/6,784,469.84",
    Q: "3-10 mill",
  };

  it("normaliza una fila de datos real", () => {
    const row = parseOxiRow(validRow);
    expect(row).toMatchObject({
      oxiId: 5893,
      fase: "Priorizado",
      departamento: "LA LIBERTAD",
      codigoReferencia: "2698796",
      nombreProyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
      funcion: "TRANSPORTE",
      montoInversionReferencial: 6784469.84,
      rangoMonto: "3-10 mill",
    });
  });

  it("retorna null cuando la columna B (N°) no es numérica", () => {
    expect(parseOxiRow({ B: "CONSULTA DE INVERSIONES EN PROMOCIÓN" })).toBeNull();
    expect(parseOxiRow({ B: "Nº Registros: 761" })).toBeNull();
    expect(parseOxiRow({})).toBeNull();
  });

  it("retorna null cuando falta el nombre del proyecto", () => {
    expect(parseOxiRow({ ...validRow, M: "" })).toBeNull();
  });

  it("deja codigoReferencia en null cuando la celda viene vacía", () => {
    const row = parseOxiRow({ ...validRow, L: "" });
    expect(row?.codigoReferencia).toBeNull();
  });
});
