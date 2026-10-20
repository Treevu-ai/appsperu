/**
 * Mezcla tests puros e integración contra Postgres real.
 *
 * Los de integración siembran filas en `raw_batches`/`port_imports` y las
 * borran al final, así que necesitan una base viva. Antes no tenían guarda:
 * importaban `createApp()` en el tope del módulo, que arrastra el pool, así que
 * sin `DATABASE_URL` el archivo entero moría al cargarse. En local pasaba
 * siempre porque el `.env` de la máquina sí la tenía — el verde local no probaba
 * nada, era el mismo patrón que ya se corrigió en infraestructura-mtc.
 *
 * `findKnownAduanaCode` sí es puro (no toca el pool) y sigue corriendo en CI.
 */
import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import XLSX from "xlsx";
import {
  findKnownAduanaCode,
  normalizeCdro16,
  normalizeFlatRanking,
  FLAT_RANKING_SHAPES,
  normalizeCuodeRanking,
  CUODE_RANKING_SHAPES,
  normalizeSectorRanking,
  SECTOR_RANKING_SHAPES,
  normalizeCountryRanking,
  COUNTRY_RANKING_SHAPES,
  normalizeCdro01,
  normalizeCdro03,
  normalizeCdro14,
  normalizeCdro02,
  normalizeCdro12,
  normalizeCdro13,
} from "../ingest/normalize.js";

const CON_DB = Boolean(process.env.DATABASE_URL);

let app: Express;
let pool: Pool;

beforeAll(async () => {
  if (!CON_DB) return;
  // Import dinamico: `app.js` importa el pool, y cargarlo en el tope del modulo
  // dispara el throw de `db/pool.ts` aunque la suite se vaya a saltar entera.
  const [{ createApp }, { pool: p }] = await Promise.all([
    import("../app.js"),
    import("../db/pool.js"),
  ]);
  app = createApp();
  pool = p;
});

// ---------------------------------------------------------------------------
// Tests unitarios de findKnownAduanaCode
// ---------------------------------------------------------------------------
describe("findKnownAduanaCode", () => {
  it("devuelve códigos conocidos para aduanas estándar", () => {
    expect(findKnownAduanaCode("SALAVERRY")).toBe(8);
    expect(findKnownAduanaCode("MARITIMA DEL CALLAO")).toBe(1);
    expect(findKnownAduanaCode("PAITA")).toBe(5);
    expect(findKnownAduanaCode("CHIMBOTE")).toBe(11);
    expect(findKnownAduanaCode("MOLLENDO - MATARANI")).toBe(3);
  });

  it("devuelve código estable para aduanas desconocidas (idempotente)", () => {
    const c1 = findKnownAduanaCode("NUEVA ADUANA FRONTERIZA");
    const c2 = findKnownAduanaCode("NUEVA ADUANA FRONTERIZA");
    expect(c1).toBe(c2);
    expect(c1).toBeGreaterThan(0);
  });

  it("match parcial: nombre contenido en key", () => {
    expect(findKnownAduanaCode("TERMINAL SALAVERRY")).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios de normalizeCdro16 — regresión del bug de 2026-10-05:
// el parser asumía una columna vacía en idx 1 que no existe en el XLSX real,
// lo que desalineaba subpartida (código) con product_desc (texto) una
// posición. Esta fila es la estructura real verificada en vivo contra
// cdro_16.xlsx (fila de ACEITES CRUDOS, aduana MARITIMA DEL CALLAO).
// ---------------------------------------------------------------------------
describe("normalizeCdro16", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }

  it("asigna subpartida al código (no a la descripción) y product_desc al texto (no a un número)", () => {
    const filas = [
      ["header fila 0"],
      ["header fila 1"],
      ["header fila 2"],
      ["header fila 3"],
      ["Total MARITIMA DEL CALLAO"],
      [
        "MARITIMA DEL CALLAO",
        1,
        "2709000000",
        "ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO",
        2273196709.909,
        2435272906.345,
        2397740313.896,
        2557788978.214,
        0.066749,
        0.04645,
      ],
    ];
    const resultado = normalizeCdro16(sheetFromRows(filas));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].subpartida).toBe("2709000000");
    expect(resultado[0].product_desc).toBe("ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO");
    expect(resultado[0].value_fob_usd).toBe(2435272906.345);
    expect(resultado[0].value_cif_usd).toBe(2557788978.214);
    expect(resultado[0].aduana_name).toBe("MARITIMA DEL CALLAO");
  });

  it("hereda el nombre de aduana del grupo 'Total XXXX' cuando la fila de detalle no repite el nombre", () => {
    const filas = [
      ["header fila 0"],
      ["header fila 1"],
      ["header fila 2"],
      ["header fila 3"],
      ["Total SALAVERRY"],
      ["", 1, "1005901100", "MAIZ DURO AMARILLO", 100, 200, 300, 400, 0.1, 0.05],
    ];
    const resultado = normalizeCdro16(sheetFromRows(filas));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].aduana_name).toBe("SALAVERRY");
    expect(resultado[0].subpartida).toBe("1005901100");
    expect(resultado[0].product_desc).toBe("MAIZ DURO AMARILLO");
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios de normalizeFlatRanking — Fase 1 del plan de conexión de
// las 20 tablas faltantes. Las filas de abajo son las reales capturadas en
// vivo (2026-10-20) con XLSX.utils.sheet_to_json(ws,{header:1}) contra cada
// archivo — no inventadas — así el test verifica el offset de columnas real
// de cada forma (hasCode / hasCif), el mismo tipo de bug que rompió
// normalizeCdro16 en 2026-10-05.
// ---------------------------------------------------------------------------
describe("normalizeFlatRanking", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  // aoa_to_sheet/sheet_to_json compactan filas realmente vacías ([]) —
  // se pierde la posición de fila, a diferencia del XLSX real donde esas
  // filas sí tienen texto de encabezado. Un placeholder no-vacío preserva
  // el índice de fila igual que el archivo real.
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("cdro_07 (subpartida, con código y CIF): asigna columnas en el offset real del XLSX", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      [1, "2709000000", "ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO", 3053379686.966, 3721131232.668, 3224316525.533, 3923490408.589, 0.216844, 0.07125],
      ["-  Cobertura Nacional"],
    ];
    const resultado = normalizeFlatRanking(sheetFromRows(filas), FLAT_RANKING_SHAPES.cdro_07);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].rank).toBe(1);
    expect(resultado[0].dimension_code).toBe("2709000000");
    expect(resultado[0].dimension_value).toBe("ACEITES CRUDOS DE PETROLEO O DE MINERAL BITUMINOSO");
    expect(resultado[0].value_fob_usd).toBeCloseTo(3721131232.668);
    expect(resultado[0].value_cif_usd).toBeCloseTo(3923490408.589);
    expect(resultado[0].pct_change).toBeCloseTo(0.216844);
    expect(resultado[0].pct_structure).toBeCloseTo(0.07125);
  });

  it("cdro_08 (empresa, sin código, con CIF): asigna columnas en el offset real del XLSX", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      [1, "REFINERIA LA PAMPILLA S.A.A", 3242050982.994, 3282609407.521, 3435249206.206, 3484982625.181, 0.014477, 0.06329],
    ];
    const resultado = normalizeFlatRanking(sheetFromRows(filas), FLAT_RANKING_SHAPES.cdro_08);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].dimension_code).toBeNull();
    expect(resultado[0].dimension_value).toBe("REFINERIA LA PAMPILLA S.A.A");
    expect(resultado[0].value_fob_usd).toBeCloseTo(3282609407.521);
    expect(resultado[0].value_cif_usd).toBeCloseTo(3484982625.181);
    expect(resultado[0].pct_structure).toBeCloseTo(0.06329);
  });

  it("cdro_09 (país origen): misma forma que cdro_08", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      [1, "CHINA", 12750441957.175, 14633076030.463, 13524747667.393, 15844812697.592, 0.171542, 0.28775],
    ];
    const resultado = normalizeFlatRanking(sheetFromRows(filas), FLAT_RANKING_SHAPES.cdro_09);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].dimension_value).toBe("CHINA");
    expect(resultado[0].value_fob_usd).toBeCloseTo(14633076030.463);
    expect(resultado[0].value_cif_usd).toBeCloseTo(15844812697.592);
  });

  it("cdro_20 (subpartida export, con código, SIN columna CIF): asigna columnas en el offset real", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 45635080086.72, 53588559746.207, 0.174284, 1],
      [1, "2603000000", "MINERALES DE COBRE Y SUS CONCENTRADOS", 20110431198.402, 20624365627.776, 0.025554999999999998, 0.38487000000000005],
    ];
    const resultado = normalizeFlatRanking(sheetFromRows(filas), FLAT_RANKING_SHAPES.cdro_20);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].dimension_code).toBe("2603000000");
    expect(resultado[0].dimension_value).toBe("MINERALES DE COBRE Y SUS CONCENTRADOS");
    expect(resultado[0].value_fob_usd).toBeCloseTo(20624365627.776);
    expect(resultado[0].value_cif_usd).toBeNull();
    expect(resultado[0].pct_structure).toBeCloseTo(0.38487000000000005);
  });

  it("detiene la lectura en la primera fila de pie de página (rank no numérico), no la incluye como dato", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, 1, 2, 3, 4, 0.1, 1],
      [1, "EMPRESA A", 10, 20, 30, 40, 0.1, 0.5],
      [2, "EMPRESA B", 5, 6, 7, 8, 0.2, 0.5],
      ["-  Cobertura Nacional"],
      ["Fuente: Declaraciones Aduaneras de Mercancías"],
    ];
    const resultado = normalizeFlatRanking(sheetFromRows(filas), FLAT_RANKING_SHAPES.cdro_08);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((r) => r.rank)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios de normalizeCuodeRanking / normalizeSectorRanking — Fase 2.
// Filas reales capturadas en vivo (2026-10-20) contra cdro_04/05/06/18/19.
// ---------------------------------------------------------------------------
describe("normalizeCuodeRanking", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("cdro_04 (subpartida, con código): hereda la categoría CUODE de la fila anterior", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      ["BIENES DE CONSUMO", null, null, null, 10791296752.318, 11163498041.013, 11466271067.998, 11909269019.554, 0.038634, 0.21628],
      ["BIENES DE CONSUMO NO DURADERO", null, null, null, 6394528360.889, 6817777811.821, 6767253928.519, 7214410115.58, 0.066076, 0.13102],
      [null, 1, "3004902900", "LOS DEMAS MEDICAMENTOS PARA USO HUMANO", 365214761.375, 371144542.553, 383708059.01, 390409762.056, 0.017464999999999998, 0.00709],
    ];
    const resultado = normalizeCuodeRanking(sheetFromRows(filas), CUODE_RANKING_SHAPES.cdro_04);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].cuode_category).toBe("BIENES DE CONSUMO NO DURADERO");
    expect(resultado[0].rank).toBe(1);
    expect(resultado[0].dimension_code).toBe("3004902900");
    expect(resultado[0].dimension_value).toBe("LOS DEMAS MEDICAMENTOS PARA USO HUMANO");
    expect(resultado[0].value_fob_usd).toBeCloseTo(371144542.553);
    expect(resultado[0].value_cif_usd).toBeCloseTo(390409762.056);
    expect(resultado[0].pct_structure).toBeCloseTo(0.00709);
  });

  it("cdro_05 (empresa, sin código): offset de columnas un lugar antes que cdro_04", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      ["BIENES DE CONSUMO", null, null, 10791296752.318, 11163498041.013, 11466271067.998, 11909269019.554, 0.038634, 0.21628],
      [null, 1, "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA 'O ' S.P.S.A.", 172836919.159, 205937743.147, 183985749.89, 215953935.97, 0.173753, 0.00392],
    ];
    const resultado = normalizeCuodeRanking(sheetFromRows(filas), CUODE_RANKING_SHAPES.cdro_05);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].cuode_category).toBe("BIENES DE CONSUMO");
    expect(resultado[0].dimension_code).toBeNull();
    expect(resultado[0].dimension_value).toBe("SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA 'O ' S.P.S.A.");
    expect(resultado[0].value_fob_usd).toBeCloseTo(205937743.147);
    expect(resultado[0].value_cif_usd).toBeCloseTo(215953935.97);
  });

  it("cdro_06 (país): misma forma que cdro_05", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      ["BIENES DE CONSUMO", null, null, 10791296752.318, 11163498041.013, 11466271067.998, 11909269019.554, 0.038634, 0.21628],
      ["BIENES DE CONSUMO NO DURADERO", null, null, 6394528360.889, 6817777811.821, 6767253928.519, 7214410115.58, 0.066076, 0.13102],
      [null, 1, "CHINA", 1616225736.322, 1785344942.144, 1701117810.956, 1932714664.466, 0.13614300000000001, 0.0351],
    ];
    const resultado = normalizeCuodeRanking(sheetFromRows(filas), CUODE_RANKING_SHAPES.cdro_06);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].dimension_value).toBe("CHINA");
    expect(resultado[0].value_fob_usd).toBeCloseTo(1785344942.144);
  });
});

describe("normalizeSectorRanking", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("cdro_18 (empresa, sin código): hereda el sector de la primera fila del grupo, ignora filas 'Total X' y separadores", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, null, 64288654932.158, 74259128122.635, 0.155089, 1],
      ["Total PRODUCTOS TRADICIONALES", null, null, null, 45635080086.72, 53588559746.207, 0.174284, 0.7216400000000001],
      ["PRODUCTOS TRADICIONALES"],
      [null, "MINERO", 1, "COMPAÑIA MINERA ANTAMINA S.A.", 4079532497.44, 4556993313.001, 0.11703799999999999, 0.061369999999999994],
      [null, null, 2, "SOCIEDAD MINERA CERRO VERDE S.A.A.", 3992311136.88, 3881393033.502, -0.027783000000000002, 0.052270000000000004],
    ];
    const resultado = normalizeSectorRanking(sheetFromRows(filas), SECTOR_RANKING_SHAPES.cdro_18);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].sector_category).toBe("MINERO");
    expect(resultado[0].dimension_value).toBe("COMPAÑIA MINERA ANTAMINA S.A.");
    expect(resultado[0].value_fob_usd).toBeCloseTo(4556993313.001);
    // Hereda el sector aunque la 2da fila del grupo no lo repita.
    expect(resultado[1].sector_category).toBe("MINERO");
    expect(resultado[1].rank).toBe(2);
    expect(resultado[1].value_fob_usd).toBeCloseTo(3881393033.502);
  });

  it("cdro_19 (producto, con código): mismo comportamiento, offset de columnas +1", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, null, null, 64288654932.158, 74259128122.635, 0.155089, 1],
      ["Total PRODUCTOS TRADICIONALES", null, null, null, null, 45635080086.72, 53588559746.207, 0.174284, 0.7216400000000001],
      ["PRODUCTOS TRADICIONALES"],
      [null, "MINERO", 1, "2603000000", "MINERALES DE COBRE Y SUS CONCENTRADOS", 20110431198.402, 20624365627.776, 0.025554999999999998, 0.27774],
    ];
    const resultado = normalizeSectorRanking(sheetFromRows(filas), SECTOR_RANKING_SHAPES.cdro_19);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].sector_category).toBe("MINERO");
    expect(resultado[0].dimension_code).toBe("2603000000");
    expect(resultado[0].dimension_value).toBe("MINERALES DE COBRE Y SUS CONCENTRADOS");
    expect(resultado[0].value_fob_usd).toBeCloseTo(20624365627.776);
    expect(resultado[0].pct_structure).toBeCloseTo(0.27774);
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios de normalizeCountryRanking — Fase 3. Filas reales
// capturadas en vivo (2026-10-20) contra cdro_10/11/21/22.
// ---------------------------------------------------------------------------
describe("normalizeCountryRanking", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("cdro_10 (subpartida, con código y CIF): ignora 'Total XXXX', hereda país de la 1ra fila del grupo", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      ["Total CHINA", null, null, null, 12750441957.175, 14633076030.463, 13524747667.393, 15844812697.592, 0.171542, 0.28775],
      ["CHINA", 1, "8517130000", "TELÉFONOS INTELIGENTES", 672943848.78, 834446994.919, 698084203.08, 858894454.886, 0.230359, 0.0156],
      [null, 2, "8471300000", "MAQ. AUTOMAT.", 417613561.259, 479754319.884, 423986729.493, 487145266.896, 0.148963, 0.00885],
    ];
    const resultado = normalizeCountryRanking(sheetFromRows(filas), COUNTRY_RANKING_SHAPES.cdro_10);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].country).toBe("CHINA");
    expect(resultado[0].dimension_code).toBe("8517130000");
    expect(resultado[0].value_fob_usd).toBeCloseTo(834446994.919);
    expect(resultado[0].value_cif_usd).toBeCloseTo(858894454.886);
    // 2da fila del grupo hereda el país sin repetirlo.
    expect(resultado[1].country).toBe("CHINA");
    expect(resultado[1].rank).toBe(2);
    expect(resultado[1].value_fob_usd).toBeCloseTo(479754319.884);
  });

  it("cdro_11 (empresa/importador, sin código, con CIF): offset de columnas un lugar antes", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 48854239429.132, 51306639698.326, 52151760961.111, 55064124291.098, 0.055844, 1],
      ["Total CHINA", null, null, 12750441957.175, 14633076030.463, 13524747667.393, 15844812697.592, 0.171542, 0.28775],
      ["CHINA", 1, "INGRAM MICRO S.A.C.", 218894903.632, 235044035.507, 223313744.606, 237979440.791, 0.06567300000000001, 0.00432],
    ];
    const resultado = normalizeCountryRanking(sheetFromRows(filas), COUNTRY_RANKING_SHAPES.cdro_11);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].country).toBe("CHINA");
    expect(resultado[0].dimension_code).toBeNull();
    expect(resultado[0].dimension_value).toBe("INGRAM MICRO S.A.C.");
    expect(resultado[0].value_fob_usd).toBeCloseTo(235044035.507);
    expect(resultado[0].value_cif_usd).toBeCloseTo(237979440.791);
  });

  it("cdro_21 (subpartida export, con código, SIN CIF)", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, null, 45635080086.72, 53588559746.207, 0.174284, 1],
      ["Total CHINA", null, null, null, 22057437368.686, 24432716308.438, 0.10768599999999999, 0.45593000000000006],
      ["CHINA", 1, "2603000000", "MINERALES DE COBRE Y SUS CONCENTRADOS", 15519481684.291, 15559862878.334, 0.002601, 0.29036],
    ];
    const resultado = normalizeCountryRanking(sheetFromRows(filas), COUNTRY_RANKING_SHAPES.cdro_21);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].country).toBe("CHINA");
    expect(resultado[0].dimension_code).toBe("2603000000");
    expect(resultado[0].value_fob_usd).toBeCloseTo(15559862878.334);
    expect(resultado[0].value_cif_usd).toBeNull();
    expect(resultado[0].pct_structure).toBeCloseTo(0.29036);
  });

  it("cdro_22 (empresa/exportador, sin código, SIN CIF)", () => {
    const filas = [
      ...filler(6),
      ["TOTAL", null, null, 45635080086.72, 53588559746.207, 0.174284, 1],
      ["Total CHINA", null, null, 22057437368.686, 24432716308.438, 0.10768599999999999, 0.45593000000000006],
      ["CHINA", 1, "COMPAÑIA MINERA ANTAMINA S.A.", 3264216718.77, 3599288804.96, 0.10265, 0.06717],
    ];
    const resultado = normalizeCountryRanking(sheetFromRows(filas), COUNTRY_RANKING_SHAPES.cdro_22);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].country).toBe("CHINA");
    expect(resultado[0].dimension_value).toBe("COMPAÑIA MINERA ANTAMINA S.A.");
    expect(resultado[0].value_fob_usd).toBeCloseTo(3599288804.96);
    expect(resultado[0].value_cif_usd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests unitarios Fase 4 (trade_summary, trade_country_bilateral,
// customs_ops_ranking). Filas reales capturadas en vivo (2026-10-20).
// ---------------------------------------------------------------------------
describe("normalizeCdro01", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("hereda niveles superficiales (sticky) y arma category_path con los ancestros", () => {
    const filas = [
      ...filler(6),
      ["EXPORTACION DEFINITIVA", null, null, 64288654932.158, 74259128122.635, 9970473190.477, 0.155089, 0.5521159999999999, 0.57421],
      [null, "TOTAL TRADICIONALES", null, 45635080086.72, 53588559746.207, 7953479659.487, 0.174284, 0.39191699999999996, 0.41438],
      [null, "TRADICIONALES", "MINERO", 39597016889.306, 46238163240.497, 6641146351.191, 0.16771799999999998, 0.340062, 0.35753999999999997],
      [null, null, "PESQUERO TRADICIONAL", 1141969287.672, 2287925261.787, 1145955974.115, 1.0034910000000001, 0.009807, 0.017689999999999997],
    ];
    const resultado = normalizeCdro01(sheetFromRows(filas));

    expect(resultado).toHaveLength(4);
    expect(resultado[0].category_path).toBe("EXPORTACION DEFINITIVA");
    expect(resultado[1].category_path).toBe("EXPORTACION DEFINITIVA");
    expect(resultado[1].item_label).toBe("TOTAL TRADICIONALES");
    expect(resultado[2].item_label).toBe("MINERO");
    expect(resultado[2].category_path).toBe("EXPORTACION DEFINITIVA > TRADICIONALES");
    expect(resultado[2].value_usd).toBeCloseTo(46238163240.497);
    // Hereda nivel1="TRADICIONALES" sin repetirlo en esta fila.
    expect(resultado[3].item_label).toBe("PESQUERO TRADICIONAL");
    expect(resultado[3].category_path).toBe("EXPORTACION DEFINITIVA > TRADICIONALES");
    expect(resultado[3].value_usd).toBeCloseTo(2287925261.787);
  });
});

describe("normalizeCdro03", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("captura la categoría como su propia fila y hereda category_path para los ítems CUODE", () => {
    const filas = [
      ...filler(6),
      ["BIENES DE CONSUMO", null, null, 11466271067.998, 11909269019.554, 0.038634, 0.21628],
      ["BIENES DE CONSUMO NO DURADERO", null, null, 6767253928.519, 7214410115.58, 0.066076, 0.13102],
      [null, 111, "PRODUCTOS ALIMENTICIOS PRIMARIOS", 227634943.999, 231033552.009, 0.01493, 0.0042],
    ];
    const resultado = normalizeCdro03(sheetFromRows(filas));

    expect(resultado).toHaveLength(3);
    expect(resultado[0].item_label).toBe("BIENES DE CONSUMO");
    expect(resultado[0].item_code).toBeNull();
    expect(resultado[2].item_code).toBe("111");
    expect(resultado[2].item_label).toBe("PRODUCTOS ALIMENTICIOS PRIMARIOS");
    expect(resultado[2].category_path).toBe("BIENES DE CONSUMO NO DURADERO");
    expect(resultado[2].value_usd).toBeCloseTo(231033552.009);
    expect(resultado[2].pct_metric).toBeCloseTo(0.0042);
  });
});

describe("normalizeCdro14", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("distingue código numérico (convenio real) de fila agregada por texto, mismo layout de columnas", () => {
    const filas = [
      ...filler(6),
      ["TOTAL IMPORTACIONES NEGOCIADAS", null, 8356577653.239, 9036667690.908, 0.160235, 0.164111],
      [34, "CONVENIO PERU - COLOMBIA D.S. 015-94/EF IQUITOS", 45829962.197, 44341723.797, 0.000878, 0.000805],
    ];
    const resultado = normalizeCdro14(sheetFromRows(filas));

    expect(resultado).toHaveLength(2);
    expect(resultado[0].item_code).toBeNull();
    expect(resultado[0].item_label).toBe("TOTAL IMPORTACIONES NEGOCIADAS");
    expect(resultado[0].value_usd).toBeCloseTo(9036667690.908);
    expect(resultado[0].pct_metric).toBeCloseTo(0.164111);
    expect(resultado[1].item_code).toBe("34");
    expect(resultado[1].item_label).toBe("CONVENIO PERU - COLOMBIA D.S. 015-94/EF IQUITOS");
    expect(resultado[1].value_usd).toBeCloseTo(44341723.797);
    expect(resultado[1].pct_metric).toBeCloseTo(0.000805);
  });
});

describe("normalizeCdro02", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("descarta 'Total XXXX' (agregado de continente) y arma continente/zona/país con el árbol sticky", () => {
    const filas = [
      ...filler(6),
      ["Total AFRICA", null, null, 379535965.496, 438346122.804, 657415373.524, 899497304.288, 1036951339.02, 1337843427.092, 0.290169, 0.01034],
      ["AFRICA", "COMUNIDAD ECONOMICA DE ESTADOS DE AFRICA OCCIDENTAL", null, 96659212.161, 163950810.675, 498151059.558, 753219786.548, 594810271.719, 917170597.223, 0.541954, 0.00709],
      [null, "COMUNIDAD ECONOMICA DE ESTADOS DE AFRICA OCCIDENTAL", "NIGERIA", 10324475.75, 34922609.58, 487667153.298, 735852166.06, 497991629.048, 770774775.64, 0.547766, 0.00596],
    ];
    const resultado = normalizeCdro02(sheetFromRows(filas));

    expect(resultado).toHaveLength(2); // "Total AFRICA" descartado
    expect(resultado[0].continent).toBe("AFRICA");
    expect(resultado[0].economic_zone).toBe("COMUNIDAD ECONOMICA DE ESTADOS DE AFRICA OCCIDENTAL");
    expect(resultado[0].country).toBeNull();
    expect(resultado[0].import_usd).toBeCloseTo(753219786.548);
    expect(resultado[1].country).toBe("NIGERIA");
    expect(resultado[1].economic_zone).toBe("COMUNIDAD ECONOMICA DE ESTADOS DE AFRICA OCCIDENTAL");
    expect(resultado[1].export_usd).toBeCloseTo(34922609.58);
    expect(resultado[1].total_usd).toBeCloseTo(770774775.64);
  });
});

describe("normalizeCdro12", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("descarta 'Total XXXX' e hereda la categoría de despachador de la 1ra fila del grupo", () => {
    const filas = [
      ...filler(7),
      ["Total AGENCIA DE ADUANA", null, null, 45558578244.55, 49095478633.888, 730194, 769094, 8347222508.55, 8978317150.25],
      ["AGENCIA DE ADUANA", 1, "BEAGLE AGENTES DE ADUANA S.A", 3522767158.546, 3542211337.29, 33041, 35834, 651834846.96, 652362268.05],
      [null, 2, "INTERAMERICAN SERVICE CO S.A.C.", 3019493251.987, 3159523952.765, 13022, 12855, 583455045.11, 590871590.66],
    ];
    const resultado = normalizeCdro12(sheetFromRows(filas));

    expect(resultado).toHaveLength(2);
    expect(resultado[0].operator_category).toBe("AGENCIA DE ADUANA");
    expect(resultado[0].value_cif_usd).toBeCloseTo(3542211337.29);
    expect(resultado[0].dam_count).toBe(35834);
    expect(resultado[0].duties_usd).toBeCloseTo(652362268.05);
    expect(resultado[1].operator_category).toBe("AGENCIA DE ADUANA");
    expect(resultado[1].rank).toBe(2);
  });
});

describe("normalizeCdro13", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("ranking plano sin categoría", () => {
    const filas = [
      ...filler(7),
      [1, "APM TERMINALS CALLAO SOCIEDAD ANONIMA", 8386858750.237, 8485932458.438, 95340, 89718, 1550667489.68, 1564959236.6],
    ];
    const resultado = normalizeCdro13(sheetFromRows(filas));

    expect(resultado).toHaveLength(1);
    expect(resultado[0].operator_category).toBeNull();
    expect(resultado[0].operator_name).toBe("APM TERMINALS CALLAO SOCIEDAD ANONIMA");
    expect(resultado[0].value_cif_usd).toBeCloseTo(8485932458.438);
    expect(resultado[0].dam_count).toBe(89718);
    expect(resultado[0].duties_usd).toBeCloseTo(1564959236.6);
  });
});

describe("normalizeSectorRanking cdro_17 (offset)", () => {
  function sheetFromRows(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
  }
  const filler = (n: number) => Array.from({ length: n }, (_, i) => [`header fila ${i}`]);

  it("desplaza sectorLabel/rank/valor una columna y detecta 'Total XXXX' en la columna desplazada", () => {
    const filas = [
      ...filler(6),
      ["Total PRODUCTOS TRADICIONALES", null, null, null, null, 45635080086.72, 53588559746.207, 0.174284, 0.7216400000000001],
      ["PRODUCTOS TRADICIONALES"],
      [null, 1, "MINERO", 1, "COBRE", 23123184182.605, 23403891510.735, 0.012139, 0.31517],
      [null, null, null, 2, "HIERRO", 1648384029.375, 1752478216.853, 0.063149, 0.0236],
      [null, null, "Total MINERO", null, null, 39597016889.306, 46238163240.497, 0.16771799999999998, 0.62266],
    ];
    const resultado = normalizeSectorRanking(sheetFromRows(filas), SECTOR_RANKING_SHAPES.cdro_17);

    expect(resultado).toHaveLength(2); // "Total MINERO" descartado
    expect(resultado[0].sector_category).toBe("MINERO");
    expect(resultado[0].dimension_value).toBe("COBRE");
    expect(resultado[0].value_fob_usd).toBeCloseTo(23403891510.735);
    expect(resultado[1].sector_category).toBe("MINERO");
    expect(resultado[1].dimension_value).toBe("HIERRO");
    expect(resultado[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests de integración de API (usan seed data en beforeAll/afterAll)
// ---------------------------------------------------------------------------
beforeAll(async () => {
  if (!CON_DB) return;
  await pool.query(`
    INSERT INTO raw_batches (source_file, year, checksum, row_count)
    VALUES ('test_cdro15.xlsx', 2024, 'testchecksum', 5)
    ON CONFLICT DO NOTHING
  `);
  const b = await pool.query<{ id: string }>(
    "SELECT id FROM raw_batches WHERE source_file = 'test_cdro15.xlsx' LIMIT 1"
  );
  const batchId = b.rows[0]?.id;
  if (batchId) {
    await pool.query(`
      INSERT INTO port_imports (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, NULL, true, 677892207, $1),
        (8, 'SALAVERRY', 2024, 1, false, 142496417, $1),
        (8, 'SALAVERRY', 2024, 2, false, 159048246, $1),
        (1, 'MARITIMA DEL CALLAO', 2024, NULL, true, 40186664921, $1),
        (5, 'PAITA', 2024, NULL, true, 1183369988, $1)
      ON CONFLICT (aduana_code, year, quarter, is_total) DO NOTHING
    `, [batchId]);

    await pool.query(`
      INSERT INTO port_subpartida_imports
        (aduana_code, aduana_name, year, subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
      VALUES
        (8, 'SALAVERRY', 2024, '1005901100', 'MAIZ DURO AMARILLO', 207522187, 207522187, 0.10, 0.05, $1),
        (8, 'SALAVERRY', 2024, '2709000000', 'ACEITES CRUDOS DE PETROLEO', 496905950, 625687169, -0.15, 0.03, $1),
        (5, 'PAITA', 2024, '2709000000', 'ACEITES CRUDOS DE PETROLEO', 589509095, 625687169, 0.05, 0.10, $1)
      ON CONFLICT (aduana_code, year, subpartida) DO NOTHING
    `, [batchId]);
  }
});

afterAll(async () => {
  if (!CON_DB) return;
  await pool.query("DELETE FROM port_subpartida_imports WHERE aduana_code IN (8, 5)");
  await pool.query("DELETE FROM port_imports WHERE aduana_code IN (8, 1, 5)");
  await pool.query("DELETE FROM raw_batches WHERE source_file = 'test_cdro15.xlsx'");
  await pool.end();
});

describe.skipIf(!CON_DB)("GET /api/ports", () => {
  it("devuelve aduanas sin filtro", async () => {
    const res = await request(app).get("/api/ports");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_15");
  });

  it("filtra por nombre de aduana (case insensitive)", async () => {
    const res = await request(app).get("/api/ports?aduana=salaverry");
    expect(res.status).toBe(200);
    for (const r of res.body.resultados) {
      expect(r.aduana_name.toLowerCase()).toContain("salaverry");
    }
  });

  it("filtra por año", async () => {
    const res = await request(app).get("/api/ports?anio=2024");
    expect(res.status).toBe(200);
    for (const r of res.body.resultados) {
      expect(r.year).toBe(2024);
    }
  });

  it("devuelve totales y trimestrales separados", async () => {
    const res = await request(app).get("/api/ports?aduana=salaverry&anio=2024");
    const totals = res.body.resultados.filter((r: { is_total: boolean }) => r.is_total);
    const quarters = res.body.resultados.filter((r: { is_total: boolean }) => !r.is_total);
    expect(totals.length).toBeGreaterThan(0);
    expect(quarters.length).toBeGreaterThan(0);
  });

  it("devuelve 400 para año malformado", async () => {
    const res = await request(app).get("/api/ports?anio=abc");
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!CON_DB)("GET /api/ports/subpartidas", () => {
  it("devuelve subpartidas de Salaverry", async () => {
    const res = await request(app).get("/api/ports/subpartidas?aduana=salaverry");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    expect(res.body.fuente).toBe("SUNAT cdro_16");
    expect(res.body.resultados[0]).toHaveProperty("subpartida");
    expect(res.body.resultados[0]).toHaveProperty("value_fob_usd");
  });

  it("filtra por código de subpartida", async () => {
    const res = await request(app).get("/api/ports/subpartidas?subpartida=1005901100");
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]?.subpartida).toBe("1005901100");
  });
});

describe.skipIf(!CON_DB)("GET /api/ports/top", () => {
  it("devuelve ranking de aduanas por volumen CIF — CALLAO primero", async () => {
    const res = await request(app).get("/api/ports/top?anio=2024");
    expect(res.status).toBe(200);
    expect(res.body.resultados.length).toBeGreaterThan(0);
    // CALLAO tiene el mayor volumen
    expect(res.body.resultados[0].aduana_name.toLowerCase()).toContain("callao");
    expect(Number(res.body.resultados[0].total_cif_usd)).toBeGreaterThan(0);
  });

  it("devuelve 400 sin año", async () => {
    const res = await request(app).get("/api/ports/top");
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!CON_DB)("GET /api/meta/freshness", () => {
  it("devuelve metadata de frescura y stats", async () => {
    const res = await request(app).get("/api/meta/freshness");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("last_ingested_at");
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("fuente");
    expect(res.body.fuente).toContain("SUNAT");
    expect(res.body.stats).toHaveProperty("port_imports_rows");
  });
});

describe.skipIf(!CON_DB)("Health checks", () => {
  it("GET /health → 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /readyz → 200 ready", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
