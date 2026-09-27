import { describe, expect, it } from "vitest";
import {
  parseCenaresPecosasCsv,
  parseFechaFlexibleDDMMYYYY,
  pickCenaresPecosasResource,
  textOrNull,
} from "../ingest/cenares-pecosas-parse.js";

// Fragmento real capturado el 2026-09-23 (DATASET_PECOSA2023.csv, datosabiertos.gob.pe).
const REAL_CSV = [
  "ANIOPECOSA;NROPECOSA;FECHAPECOSA;CODIGO_SIGA;NOMBRE_ALM;NROPEDIDO;DESCMARCAPECOSA;ANIO_OC;NRO_OC;OBSERVACION_OC;MARCA_OC;PROVEEDOR;DESC_PROVEEDOR",
  '2023;15207;6/03/2023;583800810004;NO REFRIG - SIS IMPLEM-ENTREGA A DESTINO;18390;HYOS-B20 X 10_M12 /OC 1996-23;2023;1996;"FET 1177; ACTA VERIFICACION RES N 937-23; ENTREGA (MES 12)";42390;663;DROGUERIA INVERSIONES JPS S.A.C',
  "2023;15210;6/03/2023;581000070002;NO REFRIG - SIS IMPLEM-ENTREGA A DESTINO;18363;CLINDINEX X 100_M12 /OC 1995-23;2023;1995;ENTREGA MES 12;42395;663;DROGUERIA INVERSIONES JPS S.A.C",
].join("\n");

describe("parseCenaresPecosasCsv", () => {
  it("parsea filas reales, delimitadas por ';'", () => {
    const { rows, rejected } = parseCenaresPecosasCsv(REAL_CSV);
    expect(rows).toHaveLength(2);
    expect(rejected).toHaveLength(0);
    expect(rows[0].DESCMARCAPECOSA).toBe("HYOS-B20 X 10_M12 /OC 1996-23");
    expect(rows[0].DESC_PROVEEDOR).toBe("DROGUERIA INVERSIONES JPS S.A.C");
    expect(rows[0].FECHAPECOSA).toBe("6/03/2023");
  });

  it("rechaza y cuenta una fila desalineada (con menos separadores que el encabezado)", () => {
    const messy = REAL_CSV + "\n2023;15211;6/03/2023;1;NOMBRE;1;ITEM;2023;1;OBS;42390";
    const { rows, rejected } = parseCenaresPecosasCsv(messy);
    expect(rows).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/desalineada/);
  });
});

describe("pickCenaresPecosasResource", () => {
  it("elige el recurso con formato csv (case-insensitive)", () => {
    const resource = pickCenaresPecosasResource([
      { id: "1", name: "Diccionario", format: ".xlsx", url: "https://x/dic.xlsx" },
      { id: "2", name: "DATASET Pecosa 2023", format: "csv", url: "https://x/DATASET_PECOSA2023.csv" },
      { id: "3", name: "Metadatos", format: "docx", url: "https://x/meta.docx" },
    ]);
    expect(resource.url).toBe("https://x/DATASET_PECOSA2023.csv");
  });

  it("lanza error si no hay ningún recurso CSV", () => {
    expect(() => pickCenaresPecosasResource([{ id: "1", name: "Diccionario", format: ".xlsx", url: "https://x/dic.xlsx" }])).toThrow(
      /No se encontró ningún recurso CSV/
    );
  });
});

describe("parseFechaFlexibleDDMMYYYY", () => {
  it("convierte d/m/aaaa (sin cero a la izquierda) a ISO", () => {
    expect(parseFechaFlexibleDDMMYYYY("6/03/2023")).toBe("2023-03-06");
  });

  it("convierte dd/mm/aaaa (con cero a la izquierda) a ISO también", () => {
    expect(parseFechaFlexibleDDMMYYYY("16/12/2023")).toBe("2023-12-16");
  });

  it("devuelve null para vacío, formato inesperado o fecha calendario inválida", () => {
    expect(parseFechaFlexibleDDMMYYYY("")).toBeNull();
    expect(parseFechaFlexibleDDMMYYYY(undefined)).toBeNull();
    expect(parseFechaFlexibleDDMMYYYY("2023-03-06")).toBeNull();
    expect(parseFechaFlexibleDDMMYYYY("31/02/2023")).toBeNull();
  });
});

describe("textOrNull", () => {
  it("trata vacío/whitespace como null", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull("")).toBeNull();
    expect(textOrNull("DROGUERIA INVERSIONES JPS S.A.C")).toBe("DROGUERIA INVERSIONES JPS S.A.C");
  });
});
