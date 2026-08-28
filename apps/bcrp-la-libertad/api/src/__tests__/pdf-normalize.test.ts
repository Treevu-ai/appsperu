import { describe, expect, it } from "vitest";
import {
  computeColumnPeriods,
  extractReportPeriod,
  parseAnexoTable,
  parseSoles,
  splitByAnexo,
  toIngestRows,
} from "../ingest/pdf-normalize.js";

describe("extractReportPeriod", () => {
  it("extrae mes y año de la portada real del PDF de enero 2026", () => {
    const pageOneText =
      "BANCO CENTRAL DE RESERVA DEL PERÚ\nSUCURSAL TRUJILLO\nLA LIBERTAD: Síntesis de Actividad Económica\nEnero 2026\n1\nDepartamento de Estudios Económicos";
    expect(extractReportPeriod(pageOneText)).toEqual({ year: 2026, month: 1 });
  });

  it("retorna null si no encuentra un mes+año reconocible", () => {
    expect(extractReportPeriod("texto sin fecha")).toBeNull();
  });
});

describe("computeColumnPeriods", () => {
  it("retorna 13 periodos retrocediendo desde el mes del reporte, con rollover de año", () => {
    const periods = computeColumnPeriods(2026, 1);
    expect(periods).toHaveLength(13);
    expect(periods[0]).toEqual({ year: 2025, month: 1 });
    expect(periods[11]).toEqual({ year: 2025, month: 12 });
    expect(periods[12]).toEqual({ year: 2026, month: 1 });
  });
});

describe("parseSoles", () => {
  it("parsea enteros simples", () => {
    expect(parseSoles("459")).toBe(459);
  });

  it("parsea espacio como separador de miles", () => {
    expect(parseSoles("1 349")).toBe(1349);
  });

  it("parsea coma decimal, incluyendo negativos", () => {
    expect(parseSoles("9,2")).toBe(9.2);
    expect(parseSoles("-44,1")).toBe(-44.1);
  });

  it("retorna null para '-', vacío o undefined", () => {
    expect(parseSoles("-")).toBeNull();
    expect(parseSoles("")).toBeNull();
    expect(parseSoles(undefined)).toBeNull();
  });
});

describe("parseAnexoTable", () => {
  // Texto real extraído con pdf-parse getText() sobre la página 29
  // (ANEXO 10) de docs/sintesis-la-libertad-01-2026.pdf, confirmado en vivo
  // el 2026-08-28.
  const ANEXO_10_TEXT = `LA LIBERTAD: EJECUCIÓN DEL PRESUPUESTO PÚBLICO, SEGÚN TIPO DE GASTO 1/ 2/
(En millones de soles)
ENE \tFEB \tMAR \tABR \tMAY \tJUN \tJUL \tAGO \tSET \tOCT \tNOV \tDIC \tENE
I. GASTOS CORRIENTES \t459 \t425 \t415 \t433 \t479 \t485 \t531 \t484 \t446 \t510 \t473 \t810 \t559 \tI. GASTOS CORRIENTES
Gobierno nacional \t198 \t138 \t136 \t127 \t154 \t173 \t181 \t167 \t130 \t191 \t151 \t268 \t215 \tGobierno nacional
1/ Información actualizada al 31 de enero del 2026.
2/ Considera las transferencias intergubernamentales del Gobierno Nacional.
Fuente: Ministerio de Economía y Finanzas (MEF).
Elaboración: BCRP, Sucursal Trujillo. Departamento de Estudios Económicos.
2026\t2025

-- 29 of 29 --`;

  it("extrae filas de datos con sus 13 valores, ignorando boilerplate y el encabezado de meses", () => {
    const rows = parseAnexoTable(ANEXO_10_TEXT);
    expect(rows).toHaveLength(2);
    expect(rows[0].indicador).toBe("I. GASTOS CORRIENTES");
    expect(rows[0].values).toEqual([459, 425, 415, 433, 479, 485, 531, 484, 446, 510, 473, 810, 559]);
    expect(rows[1].indicador).toBe("Gobierno nacional");
  });

  it("distingue 'Gobierno nacional' repetido bajo distintas categorías padre (ANEXO 10 real)", () => {
    // "Gobierno nacional" aparece 6 veces en el ANEXO 10 real, una por cada
    // categoría de gasto — sin esta distinción, el upsert por (anexo,
    // indicador, periodo) las pisaría entre sí.
    const text = `I. GASTOS CORRIENTES \t459 \t425 \t415 \t433 \t479 \t485 \t531 \t484 \t446 \t510 \t473 \t810 \t559 \tI. GASTOS CORRIENTES
Gobierno nacional \t198 \t138 \t136 \t127 \t154 \t173 \t181 \t167 \t130 \t191 \t151 \t268 \t215 \tGobierno nacional
Remuneraciones \t279 \t278 \t247 \t260 \t279 \t261 \t306 \t265 \t269 \t274 \t295 \t438 \t374 \tRemuneraciones
Gobierno nacional \t55 \t55 \t52 \t53 \t57 \t53 \t68 \t53 \t54 \t58 \t61 \t89 \t60 \tGobierno nacional`;
    const rows = parseAnexoTable(text);
    expect(rows).toHaveLength(4);
    const gobiernoNacionalRows = rows.filter((r) => r.indicador === "Gobierno nacional");
    expect(gobiernoNacionalRows).toHaveLength(2);
    expect(gobiernoNacionalRows[0].seccion).toBe("I. GASTOS CORRIENTES");
    expect(gobiernoNacionalRows[0].values[0]).toBe(198);
    expect(gobiernoNacionalRows[1].seccion).toBe("Remuneraciones");
    expect(gobiernoNacionalRows[1].values[0]).toBe(55);
  });

  it("agrupa filas bajo el encabezado de sección más reciente", () => {
    const text = `AGRÍCOLA
Arándano \t14 \t8 \t2 \t1 \t1 \t2 \t7 \t24 \t42 \t42 \t32 \t24 \t15 \tArándano
PECUARIO
Carne de ave \t27 \t22 \t27 \t27 \t27 \t26 \t34 \t26 \t26 \t28 \t27 \t27 \t28 \tCarne de ave`;
    const rows = parseAnexoTable(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ seccion: "AGRÍCOLA", indicador: "Arándano" });
    expect(rows[1]).toMatchObject({ seccion: "PECUARIO", indicador: "Carne de ave" });
  });

  it("retorna [] cuando el texto no tiene filas de datos válidas", () => {
    expect(parseAnexoTable("solo texto narrativo sin tablas")).toEqual([]);
  });
});

describe("toIngestRows", () => {
  it("alinea cada valor con su periodo correspondiente", () => {
    const periods = computeColumnPeriods(2026, 1);
    const rows = toIngestRows(10, [{ seccion: null, indicador: "GASTOS CORRIENTES", values: [459, ...Array(12).fill(null)] }], periods);
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({ anexoNumero: 10, indicador: "GASTOS CORRIENTES", periodoAnio: 2025, periodoMes: 1, valor: 459 });
    expect(rows[12]).toMatchObject({ periodoAnio: 2026, periodoMes: 1, valor: null });
  });
});

describe("splitByAnexo", () => {
  it("parte el texto en secciones por cada encabezado ANEXO N", () => {
    const text = "intro\nANEXO 1\nprimera tabla de datos\nANEXO N° 10\nsegunda tabla de datos";
    const sections = splitByAnexo(text);
    expect([...sections.keys()]).toEqual([1, 10]);
    expect(sections.get(1)?.trim()).toBe("primera tabla de datos");
    expect(sections.get(10)?.trim()).toBe("segunda tabla de datos");
  });

  it("retorna un mapa vacío si no hay encabezados ANEXO", () => {
    expect(splitByAnexo("sin anexos aquí").size).toBe(0);
  });
});
