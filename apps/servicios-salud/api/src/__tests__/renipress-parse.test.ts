import { describe, expect, it } from "vitest";
import {
  extractDateFromRenipressUrl,
  parseDecimal,
  parseRenipressCsv,
  pickLatestRenipressResource,
  textOrNull,
  type CkanResource,
} from "../ingest/renipress-parse.js";

describe("parseDecimal", () => {
  it("convierte un texto numérico válido", () => {
    expect(parseDecimal("-11.8671856")).toBeCloseTo(-11.8671856);
  });

  it("devuelve null para vacío, indefinido o no numérico", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal("no-es-un-numero")).toBeNull();
  });
});

describe("textOrNull", () => {
  it("recorta espacios y preserva el texto", () => {
    expect(textOrNull("  ACTIVO  ")).toBe("ACTIVO");
  });

  it("devuelve null para vacío o indefinido", () => {
    expect(textOrNull("")).toBeNull();
    expect(textOrNull("   ")).toBeNull();
    expect(textOrNull(undefined)).toBeNull();
  });
});

describe("extractDateFromRenipressUrl", () => {
  it("extrae la fecha de un nombre de archivo real de RENIPRESS", () => {
    const date = extractDateFromRenipressUrl(
      "https://www.datosabiertos.gob.pe/sites/default/files/RENIPRESS_31-08-2026.csv"
    );
    expect(date).toEqual(new Date(2026, 7, 31));
  });

  it("devuelve null si la URL no sigue el patrón esperado", () => {
    expect(extractDateFromRenipressUrl("https://www.datosabiertos.gob.pe/sites/default/files/IPRESS.csv")).toBeNull();
  });
});

describe("pickLatestRenipressResource", () => {
  const resource = (url: string, format = "CSV"): CkanResource => ({ id: url, name: url, format, url });

  it("elige el recurso CSV con la fecha más reciente, sin asumir orden en el arreglo", () => {
    const resources = [
      resource("https://x/RENIPRESS_30-04-2026.csv"),
      resource("https://x/RENIPRESS_31-08-2026.csv"),
      resource("https://x/RENIPRESS_29-05-2026.csv"),
    ];
    expect(pickLatestRenipressResource(resources).url).toBe("https://x/RENIPRESS_31-08-2026.csv");
  });

  it("ignora recursos que no son CSV (ej. el diccionario de datos en xlsx)", () => {
    const resources = [
      resource("https://x/Diccionario.xlsx", "XLSX"),
      resource("https://x/RENIPRESS_30-04-2026.csv"),
    ];
    expect(pickLatestRenipressResource(resources).url).toBe("https://x/RENIPRESS_30-04-2026.csv");
  });

  it("lanza un error explícito si no hay ningún recurso CSV", () => {
    expect(() => pickLatestRenipressResource([resource("https://x/Diccionario.xlsx", "XLSX")])).toThrow(
      /ningún recurso CSV/
    );
  });

  it("con un solo recurso sin fecha reconocible, lo devuelve igual (no falla)", () => {
    const resources = [resource("https://x/IPRESS.csv")];
    expect(pickLatestRenipressResource(resources).url).toBe("https://x/IPRESS.csv");
  });
});

describe("parseRenipressCsv", () => {
  // Fila real (anonimizada de coordenadas exactas) tomada del recurso RENIPRESS_31-08-2026.csv
  // durante el spike de ADR-0018 — confirma delimitador ';', BOM UTF-8 y las 31 columnas reales.
  const HEADER =
    "INSTITUCION;COD_IPRESS;NOMBRE;CLASIFICACION;TIPO_ESTABLECIMIENTO;DEPARTAMENTO;PROVINCIA;DISTRITO;UBIGEO;DIRECCION;CO_DISA;COD_RED;COD_MICRORRED;DISA;RED;MICRORED;COD_UE;UNIDAD_EJECUTORA;CATEGORIA;TELEFONO;HORARIO;INICIO_ACTIVIDAD;ESTADO;NORTE;ESTE;IMAGEN_1;FE_ACT_IMAGEN_1;IMAGEN_2;FE_ACT_IMAGEN_2;IMAGEN_3;FE_ACT_IMAGEN_3";
  const ROW =
    "GOBIERNO REGIONAL;00002806;LA NOVIA;PUESTOS DE SALUD O POSTAS DE SALUD;ESTABLECIMIENTO DE SALUD SIN INTERNAMIENTO;MADRE DE DIOS;TAHUAMANU;TAHUAMANU;170303;CARRETERA IBERIA KM 80;25.0;137.0;915.0;MADRE DE DIOS;MADRE DE DIOS;IBERIA;879.0;SALUD MADRE DE DIOS;I-1;973267838;7:00 - 19:00;1995-01-01 00:00:00;ACTIVO;-11.8671856;-69.13774377;;;;;;";

  it("parsea una fila real con el delimitador ';' y expone las columnas por nombre", () => {
    const csv = `${HEADER}\n${ROW}\n`;
    const rows = parseRenipressCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].COD_IPRESS).toBe("00002806");
    expect(rows[0].UBIGEO).toBe("170303");
    expect(rows[0].ESTADO).toBe("ACTIVO");
    expect(rows[0].NORTE).toBe("-11.8671856");
  });

  it("maneja el BOM UTF-8 al inicio del archivo sin corromper la primera columna", () => {
    const csv = `﻿${HEADER}\n${ROW}\n`;
    const rows = parseRenipressCsv(csv);
    expect(rows[0].INSTITUCION).toBe("GOBIERNO REGIONAL");
  });

  it("tolera filas con menos columnas de las esperadas sin lanzar", () => {
    const csv = `${HEADER}\nGOBIERNO REGIONAL;00000001;INCOMPLETA\n`;
    expect(() => parseRenipressCsv(csv)).not.toThrow();
  });
});
