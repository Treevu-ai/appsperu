import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseMontoSoles, parseOxiWorkbook } from "../ingest/oxi-xlsx.js";

function buildSampleWorkbook(): Buffer {
  const rows = [
    ["", "CONSULTA DE INVERSIONES EN PROMOCIÓN"],
    ["", "Nº Registros: 2"],
    [
      "",
      "N°",
      "FASE OXI 2/.",
      "TIPO DE INVERSIÓN",
      "ÚLTIMO NIVEL DE ESTUDIO",
      "NIVEL DE GOBIERNO",
      "DEPARTAMENTO",
      "PROVINCIA",
      "DISTRITO",
      "ENTIDAD",
      "LINK WEB",
      "CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA",
      "NOMBRE DEL PROYECTO",
      "FUNCIÓN",
      "TIPOLOGIA",
      "MONTO DE INVERSIÓN REFERENCIAL",
      "RANGO MONTO INVERSIÓN",
    ],
    [
      "",
      "1001",
      "Priorizado",
      "IOARR",
      "Ficha técnica",
      "Gobierno Local Provincial",
      "LA LIBERTAD",
      "TRUJILLO",
      "TRUJILLO",
      "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
      "Enlace",
      "2716769",
      "MEJORAMIENTO DE PARQUE",
      "AMBIENTE",
      "Espacios Públicos Verdes",
      "S/443,431.09",
      "< 1 mill",
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("parseMontoSoles", () => {
  it("parsea montos en soles con separadores", () => {
    expect(parseMontoSoles("S/443,431.09")).toBe(443431.09);
    expect(parseMontoSoles(null)).toBeNull();
  });
});

describe("parseOxiWorkbook", () => {
  it("detecta encabezados y normaliza filas de datos", () => {
    const rows = parseOxiWorkbook(buildSampleWorkbook());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      oxiId: 1001,
      departamento: "LA LIBERTAD",
      provincia: "TRUJILLO",
      codigoSnip: "2716769",
      nombre: "MEJORAMIENTO DE PARQUE",
      montoReferencial: "S/443,431.09",
    });
  });
});
