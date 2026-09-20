import { describe, expect, it } from "vitest";
import {
  parseCenaresCsv,
  parseDecimal,
  parseFechaDDMMYYYY,
  pickCenaresResource,
  textOrNull,
} from "../ingest/cenares-parse.js";

// Fragmento real capturado el 2026-09-19 (CSV Dataset_CD1.csv, datosabiertos.gob.pe).
const REAL_CSV = [
  "ESTRATEGIA;META;CODMEF;DESTINO;CODIGOSISMED;CODIGOSIGA;ITEM;CANTIDAD;NROCD;OBSERVACION;REFERENCIA;FECHACREACION;SITUACION;PENDIENTE;NROPECOSA;FECHAPECOSA;ESTADODESPACHO;REFRIGERADO",
  "SIS;468;1235;INSTITUTO NACIONAL DE ENFERMEDADES NEOPLASICAS;26367;585100100034;SODIO CLORURO CIRCUITO CERRADO 500 ML 900 MG/100 ML (0.9 %) INY;4500;7718;OC 4427-24/MES 12/ ;ENTREGA A DESTINO;20/05/2024;ENVIADO A ALMACEN;No;0;;;",
  "SIS;468;1320;REG. AREQUIPA - INST. REG. DE ENFERMEDADES NEOPLASICAS DEL SUR (IREN SUR);26367;585100100034;SODIO CLORURO CIRCUITO CERRADO 500 ML 900 MG/100 ML (0.9 %) INY;1008;7717;OC 4426-24/MES 12/ ;ENTREGA A DESTINO;20/05/2024;ENVIADO A ALMACEN;No;0;;;",
].join("\n");

describe("parseCenaresCsv", () => {
  it("parsea filas reales, delimitadas por ';'", () => {
    const { rows, rejected } = parseCenaresCsv(REAL_CSV);
    expect(rows).toHaveLength(2);
    expect(rejected).toHaveLength(0);
    expect(rows[0].DESTINO).toBe("INSTITUTO NACIONAL DE ENFERMEDADES NEOPLASICAS");
    expect(rows[0].ITEM).toBe("SODIO CLORURO CIRCUITO CERRADO 500 ML 900 MG/100 ML (0.9 %) INY");
    expect(rows[0].CANTIDAD).toBe("4500");
    expect(rows[0].SITUACION).toBe("ENVIADO A ALMACEN");
  });

  it("acepta una fila con un ';' de más dentro de OBSERVACION cuando viene entrecomillado", () => {
    const withQuotedSemicolon =
      REAL_CSV +
      '\nSIS;468;1235;DESTINO X;26367;585100100034;ITEM;1;7719;"obs con ; punto y coma de más";REF;20/05/2024;OK;No;0;;;';
    const { rows, rejected } = parseCenaresCsv(withQuotedSemicolon);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[2].OBSERVACION).toBe("obs con ; punto y coma de más");
  });

  it("rechaza y cuenta una fila desalineada (con menos separadores que el encabezado) en vez de insertarla con columnas corridas", () => {
    const messy = REAL_CSV + "\nSIS;468;1235;DESTINO X;1;1;ITEM;1;1;obs sin comillas con ; de más;REF;20/05/2024;OK;No;0";
    const { rows, rejected } = parseCenaresCsv(messy);
    expect(rows).toHaveLength(2); // solo las 2 filas reales bien formadas
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/desalineada/);
  });
});

describe("pickCenaresResource", () => {
  it("elige el recurso con formato csv (case-insensitive)", () => {
    const resource = pickCenaresResource([
      { id: "1", name: "Diccionario", format: ".xlsx", url: "https://x/dic.xlsx" },
      { id: "2", name: "CSV Seguimiento", format: "csv", url: "https://x/data.csv" },
      { id: "3", name: "Metadatos", format: "docx", url: "https://x/meta.docx" },
    ]);
    expect(resource.url).toBe("https://x/data.csv");
  });

  it("lanza error si no hay ningún recurso CSV", () => {
    expect(() => pickCenaresResource([{ id: "1", name: "Diccionario", format: ".xlsx", url: "https://x/dic.xlsx" }])).toThrow(
      /No se encontró ningún recurso CSV/
    );
  });
});

describe("parseFechaDDMMYYYY", () => {
  it("convierte dd/mm/aaaa a ISO", () => {
    expect(parseFechaDDMMYYYY("20/05/2024")).toBe("2024-05-20");
  });

  it("devuelve null para vacío o formato inesperado", () => {
    expect(parseFechaDDMMYYYY("")).toBeNull();
    expect(parseFechaDDMMYYYY(undefined)).toBeNull();
    expect(parseFechaDDMMYYYY("2024-05-20")).toBeNull();
  });
});

describe("parseDecimal / textOrNull", () => {
  it("parseDecimal convierte texto numérico y trata vacío como null", () => {
    expect(parseDecimal("4500")).toBe(4500);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });

  it("textOrNull trata vacío/whitespace como null", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull("")).toBeNull();
    expect(textOrNull("ENVIADO A ALMACEN")).toBe("ENVIADO A ALMACEN");
  });
});
