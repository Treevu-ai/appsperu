import { describe, expect, it } from "vitest";
import {
  buildHeaderIndex,
  findColumnValue,
  findColumnValueAny,
  parseCkanDrupalDate,
  parseFechaCorte,
  parseInfomidisCsv,
  parseInfomidisNumber,
  pickLatestInfomidisResource,
  type CkanResource,
} from "../ingest/infomidis-parse.js";

// Header y fila reales (anonimizados) tomados de 202408_INFOMIDIS.csv durante
// el spike de ADR-0018 — confirma delimitador ';', 18 columnas, y comas como
// separador de miles (no decimal).
const HEADER =
  "FECHA_CORTE;UBIGEO;CUNAMAS - Cuidado Diurno;CUNAMAS - Acompañamiento de Familias;JUNTOS - Hogares afiliados;JUNTOS - Hogares abonados;FONCODES - N° usuarios estimados;FONCODES - N° proy. Culminados;FONCODES - N° proy. en ejecucion;FONCODES - N° Hog. Haku Winay -proyectos en ejecucion;FONCODES - N° Hog. Haku Winay -proyectos culminados;PENSION 65 - Usuarios;QALI WARMA - N° de Niños y niñas atendidos;QALI WARMA - N° de IIEE;CONTIGO - Usuarios;PAIS - N° de Tambos prestando servicios;PAIS - N° de Atenciones realizadas a través de los Tambos;PAIS - N° de Beneficiarios atendidos a través de los Tambos";
const ROW = "20241031;010101;96;90;493;423;;;;;;642;5,234;34;252;;;";

describe("parseInfomidisCsv", () => {
  it("parsea una fila real con el delimitador ';'", () => {
    const rows = parseInfomidisCsv(`${HEADER}\n${ROW}\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].FECHA_CORTE).toBe("20241031");
    expect(rows[0].UBIGEO).toBe("010101");
  });

  it("maneja el BOM al inicio del archivo", () => {
    const rows = parseInfomidisCsv(`﻿${HEADER}\n${ROW}\n`);
    expect(rows[0].FECHA_CORTE).toBe("20241031");
  });
});

describe("buildHeaderIndex + findColumnValue", () => {
  it("encuentra cada columna por palabras clave normalizadas, tildes y ° incluidos", () => {
    const rows = parseInfomidisCsv(`${HEADER}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);

    expect(findColumnValue(rows[0], index, ["CUNAMAS", "CUIDADO", "DIURNO"])).toBe("96");
    expect(findColumnValue(rows[0], index, ["CUNAMAS", "ACOMPA"])).toBe("90");
    expect(findColumnValue(rows[0], index, ["JUNTOS", "AFILIADOS"])).toBe("493");
    expect(findColumnValue(rows[0], index, ["JUNTOS", "ABONADOS"])).toBe("423");
    expect(findColumnValue(rows[0], index, ["PENSION", "65", "USUARIOS"])).toBe("642");
    expect(findColumnValue(rows[0], index, ["QALI", "WARMA", "NINOS", "ATENDIDOS"])).toBe("5,234");
    expect(findColumnValue(rows[0], index, ["QALI", "WARMA", "IIEE"])).toBe("34");
    expect(findColumnValue(rows[0], index, ["CONTIGO", "USUARIOS"])).toBe("252");
  });

  it("devuelve undefined si ninguna columna calza (no lanza)", () => {
    const rows = parseInfomidisCsv(`${HEADER}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);
    expect(findColumnValue(rows[0], index, ["COLUMNA", "INEXISTENTE"])).toBeUndefined();
  });
});

describe("findColumnValueAny", () => {
  it("prueba conjuntos alternativos en orden — resuelve el renombre real QALI WARMA -> WASI MIKUNA", () => {
    const rows = parseInfomidisCsv(`${HEADER}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);
    const value = findColumnValueAny(rows[0], index, [
      ["WASI", "MIKUNA", "NINOS", "ATENDIDOS"],
      ["QALI", "WARMA", "NINOS", "ATENDIDOS"],
    ]);
    expect(value).toBe("5,234");
  });

  it("con un corte real de 2026 que usa 'WASI MIKUNA', encuentra la columna con la alternativa nueva", () => {
    const header2026 = HEADER.replace(
      "QALI WARMA - N° de Niños y niñas atendidos;QALI WARMA - N° de IIEE",
      "WASI MIKUNA - N° de Niños y niñas atendidos;WASI MIKUNA - N° de IIEE"
    );
    const rows = parseInfomidisCsv(`${header2026}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);
    const value = findColumnValueAny(rows[0], index, [
      ["QALI", "WARMA", "NINOS", "ATENDIDOS"],
      ["WASI", "MIKUNA", "NINOS", "ATENDIDOS"],
    ]);
    expect(value).toBe("5,234");
  });

  it("con el corte real 2026-04 que trae '?' literal en vez de 'ñ' (bytes crudos confirmados 0x3F), resuelve por 'ATENDIDOS'", () => {
    // Reproduce exactamente lo confirmado en los bytes crudos de ABRIL_2026.csv:
    // "Niños y niñas" llega como "Ni?s y ni?s" en el archivo de origen.
    const headerCorrupto = HEADER.replace(
      "QALI WARMA - N° de Niños y niñas atendidos;QALI WARMA - N° de IIEE",
      "WASI MIKUNA - N? de Ni?s y ni?s atendidos;WASI MIKUNA - N? de IIEE"
    );
    const rows = parseInfomidisCsv(`${headerCorrupto}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);
    const value = findColumnValueAny(rows[0], index, [
      ["QALI", "WARMA", "NINOS", "ATENDIDOS"],
      ["WASI", "MIKUNA", "NINOS", "ATENDIDOS"],
      ["QALI", "WARMA", "ATENDIDOS"],
      ["WASI", "MIKUNA", "ATENDIDOS"],
    ]);
    expect(value).toBe("5,234");
  });

  it("devuelve undefined si ninguna alternativa calza", () => {
    const rows = parseInfomidisCsv(`${HEADER}\n${ROW}\n`);
    const index = buildHeaderIndex(rows[0]);
    expect(findColumnValueAny(rows[0], index, [["NO", "EXISTE"], ["TAMPOCO", "ESTA"]])).toBeUndefined();
  });
});

describe("parseInfomidisNumber", () => {
  it("quita la coma de miles antes de convertir (\"5,234\" -> 5234, no 5)", () => {
    expect(parseInfomidisNumber("5,234")).toBe(5234);
  });

  it("devuelve null para vacío o indefinido, nunca 0", () => {
    expect(parseInfomidisNumber("")).toBeNull();
    expect(parseInfomidisNumber(undefined)).toBeNull();
  });

  it("convierte un número simple sin coma", () => {
    expect(parseInfomidisNumber("642")).toBe(642);
  });
});

describe("parseFechaCorte", () => {
  it("convierte YYYYMMDD a YYYY-MM-DD", () => {
    expect(parseFechaCorte("20241031")).toBe("2024-10-31");
  });

  it("devuelve null si no calza el formato", () => {
    expect(parseFechaCorte("31-10-2024")).toBeNull();
    expect(parseFechaCorte(undefined)).toBeNull();
  });
});

describe("parseCkanDrupalDate", () => {
  it("parsea el formato Drupal real 'Vie, 05/15/2026 - 14:47' (MM/DD/YYYY)", () => {
    const date = parseCkanDrupalDate("Vie, 05/15/2026 - 14:47");
    expect(date).toEqual(new Date(2026, 4, 15, 14, 47));
  });

  it("devuelve null para undefined o texto sin fecha", () => {
    expect(parseCkanDrupalDate(undefined)).toBeNull();
    expect(parseCkanDrupalDate("sin fecha")).toBeNull();
  });
});

describe("pickLatestInfomidisResource", () => {
  const resource = (overrides: Partial<CkanResource>): CkanResource => ({
    id: "r", name: "r", format: "csv", url: "https://x/r.csv", created: undefined, ...overrides,
  });

  it("elige el recurso CSV con el `created` más reciente, sin depender del nombre del archivo", () => {
    const resources = [
      resource({ url: "https://x/202408_INFOMIDIS.csv", created: "Jue, 10/31/2024 - 10:54" }),
      resource({ url: "https://x/ABRIL_2026.csv", created: "Lun, 08/03/2026 - 16:59" }),
      resource({ url: "https://x/OCTUBRE_2024.csv", created: "Vie, 11/29/2024 - 16:58" }),
    ];
    expect(pickLatestInfomidisResource(resources).url).toBe("https://x/ABRIL_2026.csv");
  });

  it("ignora recursos que no son CSV (diccionario xlsx, metadatos docx)", () => {
    const resources = [
      resource({ format: "xlsx", url: "https://x/Diccionario.xlsx", created: "Vie, 12/01/2026 - 00:00" }),
      resource({ format: "docx", url: "https://x/Metadatos.docx", created: "Vie, 12/01/2026 - 00:00" }),
      resource({ url: "https://x/202408_INFOMIDIS.csv", created: "Jue, 10/31/2024 - 10:54" }),
    ];
    expect(pickLatestInfomidisResource(resources).url).toBe("https://x/202408_INFOMIDIS.csv");
  });

  it("normaliza el formato '.csv' (con punto) confirmado en algunos recursos reales", () => {
    const resources = [resource({ format: ".csv", url: "https://x/ENERO_2026.csv", created: "Vie, 05/15/2026 - 14:47" })];
    expect(pickLatestInfomidisResource(resources).url).toBe("https://x/ENERO_2026.csv");
  });

  it("descarta un recurso con formato 'data' y URL vacía (confirmado real en el dataset)", () => {
    const resources = [
      resource({ format: "data", url: "", created: "Mié, 06/11/2025 - 10:41" }),
      resource({ format: "csv", url: "https://x/ABRIL2025.csv", created: "Mié, 06/11/2025 - 10:45" }),
    ];
    expect(pickLatestInfomidisResource(resources).url).toBe("https://x/ABRIL2025.csv");
  });

  it("lanza un error explícito si no hay ningún recurso CSV utilizable", () => {
    expect(() => pickLatestInfomidisResource([resource({ format: "xlsx" })])).toThrow(/ningún recurso CSV/);
  });
});
