import { describe, expect, it } from "vitest";
import {
  extractYearFromResourceName,
  parseCount,
  parseEmpresasCsv,
  pickEmpresasResource,
  textOrNull,
  type CkanResource,
} from "../ingest/empresas-distrito-parse.js";

// Header y filas reales tomados de Dataset__Empr_Sect_Privado_mes_ 2022_MTPE.csv
// durante el spike de ADR-0021 — confirma delimitador ';', "SETIEMBRE" (no
// "SEPTIEMBRE"), y valores con espacio final.
const HEADER = "FECHA_CORTE;CODIGO_DE_UBIGEO;DISTRITOS;ENERO;FEBRERO;MARZO;ABRIL;MAYO;JUNIO;JULIO;AGOSTO;SETIEMBRE;OCTUBRE;NOVIEMBRE;DICIEMBRE";
const ROW_TRUJILLO = "20230807;130101;TRUJILLO;10076 ;10059 ;10063 ;10191 ;10296 ;10353 ;10429 ;10458 ;10578 ;10681 ;10761 ;10660 ";
const ROW_NEPENA = "20230807;021806;NEPEÑA;39 ;39 ;39 ;41 ;43 ;42 ;41 ;38 ;37 ;38 ;38 ;37 ";

describe("parseEmpresasCsv", () => {
  it("parsea filas reales con el delimitador ';'", () => {
    const rows = parseEmpresasCsv(`${HEADER}\n${ROW_TRUJILLO}\n${ROW_NEPENA}\n`);
    expect(rows).toHaveLength(2);
    expect(rows[0].CODIGO_DE_UBIGEO).toBe("130101");
    expect(rows[0].DISTRITOS).toBe("TRUJILLO");
  });

  it("maneja el BOM al inicio del archivo", () => {
    const rows = parseEmpresasCsv(`﻿${HEADER}\n${ROW_TRUJILLO}\n`);
    expect(rows[0].FECHA_CORTE).toBe("20230807");
  });

  it("preserva el nombre con Ñ cuando el texto ya viene decodificado correctamente", () => {
    const rows = parseEmpresasCsv(`${HEADER}\n${ROW_NEPENA}\n`);
    expect(rows[0].DISTRITOS).toBe("NEPEÑA");
  });
});

describe("parseCount", () => {
  it("quita el espacio final antes de convertir (\"10076 \" -> 10076, no falla)", () => {
    expect(parseCount("10076 ")).toBe(10076);
  });

  it("no confunde un valor de 5 dígitos con un separador de miles interno", () => {
    expect(parseCount("16523 ")).toBe(16523);
  });

  it("devuelve null para vacío o indefinido, nunca 0", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });

  it("devuelve null para un valor no numérico (ej. '-')", () => {
    expect(parseCount("-")).toBeNull();
  });
});

describe("textOrNull", () => {
  it("recorta espacios y preserva el texto", () => {
    expect(textOrNull("  TRUJILLO  ")).toBe("TRUJILLO");
  });

  it("devuelve null para vacío o indefinido", () => {
    expect(textOrNull("")).toBeNull();
    expect(textOrNull(undefined)).toBeNull();
  });
});

describe("extractYearFromResourceName", () => {
  it("extrae el año real del título del recurso, no de FECHA_CORTE", () => {
    expect(extractYearFromResourceName("Empresas en el Sector Privado por mes, según distritos año 2022 ")).toBe(2022);
  });

  it("con varios años en el nombre, usa el último (el más específico/reciente mencionado)", () => {
    expect(extractYearFromResourceName("Reporte 2020-2022 actualizado")).toBe(2022);
  });

  it("devuelve null si no hay ningún año de 4 dígitos en el nombre", () => {
    expect(extractYearFromResourceName("Reporte sin año")).toBeNull();
  });
});

describe("pickEmpresasResource", () => {
  const resource = (overrides: Partial<CkanResource>): CkanResource => ({
    id: "r", name: "r", format: "csv", url: "https://x/r.csv", ...overrides,
  });

  it("elige el único recurso CSV sin advertencia cuando hay exactamente uno", () => {
    const resources = [
      resource({ format: "docx", url: "https://x/Metadatos.docx" }),
      resource({ format: "data", url: "https://x/Diccionario.xlsx" }),
      resource({ name: "Empresas... año 2022", url: "https://x/2022.csv" }),
    ];
    const { resource: picked, warning } = pickEmpresasResource(resources);
    expect(picked.url).toBe("https://x/2022.csv");
    expect(warning).toBeNull();
  });

  it("advierte explícitamente si aparece más de un recurso CSV, sin fallar", () => {
    const resources = [
      resource({ name: "año 2021", url: "https://x/2021.csv" }),
      resource({ name: "año 2022", url: "https://x/2022.csv" }),
    ];
    const { resource: picked, warning } = pickEmpresasResource(resources);
    expect(picked.url).toBe("https://x/2022.csv");
    expect(warning).toMatch(/Se encontraron 2 recursos CSV/);
  });

  it("ignora recursos sin URL o que no son CSV", () => {
    const resources = [resource({ format: "data", url: "" }), resource({ format: "csv", url: "https://x/ok.csv" })];
    expect(pickEmpresasResource(resources).resource.url).toBe("https://x/ok.csv");
  });

  it("lanza un error explícito si no hay ningún recurso CSV utilizable", () => {
    const resources = [resource({ format: "xlsx" })];
    expect(() => pickEmpresasResource(resources)).toThrow(/ningún recurso CSV/);
  });
});
