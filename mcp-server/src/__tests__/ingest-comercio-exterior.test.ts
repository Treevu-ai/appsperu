/**
 * Tests de los conectores de comercio exterior (normalización pura).
 *
 * Los valores de prueba NO son inventados: son el header y las filas reales
 * capturados en vivo el 2026-10-14 de
 * https://datosabiertos.mincetur.gob.pe/DGIECE/Comercio_exterior_bienes_2024.xlsx
 * (fila 2: `FECHA_CORTE=20260512 | FLUJO=IMPORTACION | ANIO=2024 | MES=11 |
 * SUBPARTIDA=0101210000 | PAIS=CL | USD_MILLONES=0,063 | TM=0,5 | VIA=AÉREO`),
 * y de las respuestas reales de comtradeapi.un.org y api.worldbank.org.
 */

import { describe, expect, it } from "vitest";
import { decodificarXml, parseRowCells } from "../ingest/xlsx-rows.js";
import { AgregadorComercio, normalizarFila, parseNumeroEs } from "../ingest/mincetur-normalize.js";
import { buildUrl as buildComtradeUrl, normalizarComtrade, lotesPorFila, partirLotes } from "../ingest/comtrade-benchmark.js";
import { buildUrl as buildWdiUrl, normalizarWdi } from "../ingest/wdi-contexto.js";

/** Fila real del XLSX 2024 (con una entidad XML en la descripción, como trae la fuente). */
const FILA_REAL = `<row r="2" s="2" customFormat="1">` +
  `<c r="A2" s="2" t="inlineStr"><is><t>20260512</t></is></c>` +
  `<c r="B2" s="2" t="inlineStr"><is><t>IMPORTACION</t></is></c>` +
  `<c r="C2" s="2" t="inlineStr"><is><t>2024</t></is></c>` +
  `<c r="D2" s="2" t="inlineStr"><is><t>11</t></is></c>` +
  `<c r="E2" s="2" t="inlineStr"><is><t>0101210000</t></is></c>` +
  `<c r="F2" s="2" t="inlineStr"><is><t>REPRODUCTORES DE CABALLOS  DE RAZA PURA &amp; CRIOLLOS</t></is></c>` +
  `<c r="G2" s="2" t="inlineStr"><is><t>AGROPECUARIO</t></is></c>` +
  `<c r="H2" s="2" t="inlineStr"><is><t>NO TRADICIONAL</t></is></c>` +
  `<c r="I2" s="2" t="inlineStr"><is><t>CL</t></is></c>` +
  `<c r="J2" s="2" t="inlineStr"><is><t>CHILE</t></is></c>` +
  `<c r="K2" s="2" t="inlineStr"><is><t>AMÉRICA</t></is></c>` +
  `<c r="L2" s="2" t="inlineStr"><is><t>APEC</t></is></c>` +
  `<c r="M2" s="2" t="inlineStr"><is><t>ALADI</t></is></c>` +
  `<c r="N2" s="2" t="inlineStr"><is><t>0,063</t></is></c>` +
  `<c r="O2" s="2" t="inlineStr"><is><t>0,5</t></is></c>` +
  `<c r="P2" s="2" t="inlineStr"><is><t>III. BIENES DE CAPITAL Y MATERIALES DE CONSTRUCCION</t></is></c>` +
  `<c r="Q2" s="2" t="inlineStr"><is><t>4</t></is></c>` +
  `<c r="R2" s="2" t="inlineStr"><is><t>AÉREO</t></is></c>` +
  `</row>`;

describe("parseRowCells / decodificarXml", () => {
  it("extrae las 18 celdas de una fila real, en orden de columna", () => {
    const celdas = parseRowCells(FILA_REAL);
    expect(celdas).toHaveLength(18);
    expect(celdas[0]).toBe("20260512");
    expect(celdas[1]).toBe("IMPORTACION");
    expect(celdas[4]).toBe("0101210000");
    expect(celdas[13]).toBe("0,063");
  });

  it("decodifica entidades XML de la fuente", () => {
    expect(decodificarXml("REPRODUCTORES &amp; CRIOLLOS")).toBe("REPRODUCTORES & CRIOLLOS");
    // El parser devuelve la celda TAL CUAL (la fuente trae espacios dobles):
    // colapsar es trabajo de normalizarFila, no del parser.
    expect(parseRowCells(FILA_REAL)[5]).toBe("REPRODUCTORES DE CABALLOS  DE RAZA PURA & CRIOLLOS");
    expect(normalizarFila(FILA_REAL)!.descripcion).toBe("REPRODUCTORES DE CABALLOS DE RAZA PURA & CRIOLLOS");
  });

  it("rechaza sharedStrings en vez de devolver basura", () => {
    const filaShared = `<row r="2"><c r="A2" t="s"><v>0</v></c></row>`;
    expect(() => parseRowCells(filaShared)).toThrow(/sharedStrings/);
  });
});

describe("parseNumeroEs (formato numérico de la fuente)", () => {
  it("convierte decimal con coma", () => {
    expect(parseNumeroEs("0,063")).toBe(0.063);
  });
  it("convierte miles con punto y decimal con coma", () => {
    expect(parseNumeroEs("1.234,5")).toBe(1234.5);
  });
  it("devuelve null en vacío o guion, no cero inventado", () => {
    expect(parseNumeroEs("")).toBeNull();
    expect(parseNumeroEs("-")).toBeNull();
    expect(parseNumeroEs(undefined)).toBeNull();
  });
});

describe("normalizarFila (MINCETUR)", () => {
  it("normaliza la fila real con la subpartida como texto (conserva el cero inicial)", () => {
    const fila = normalizarFila(FILA_REAL);
    expect(fila).not.toBeNull();
    expect(fila!.subpartida).toBe("0101210000");
    expect(fila!.anio).toBe(2024);
    expect(fila!.mes).toBe(11);
    expect(fila!.flujo).toBe("IMPORTACION");
    expect(fila!.paisCodigo).toBe("CL");
    expect(fila!.bloque1).toBe("APEC");
    expect(fila!.viaNombre).toBe("AÉREO");
    expect(fila!.usdMillones).toBe(0.063);
    expect(fila!.tm).toBe(0.5);
  });

  it("descarta una fila incompleta (sin anio/subpartida/pais)", () => {
    expect(normalizarFila(`<row r="9"><c r="A9" t="inlineStr"><is><t>20260512</t></is></c></row>`)).toBeNull();
  });
});

describe("AgregadorComercio (mensual -> anual)", () => {
  it("suma meses de la misma clave y cuenta las filas fusionadas", () => {
    const agg = new AgregadorComercio();
    const base = normalizarFila(FILA_REAL)!;
    const otraMes = { ...base, mes: 12, usdMillones: 1.5, tm: 2 };
    agg.add(base);
    agg.add(otraMes);
    const [fila] = agg.toArray();
    expect(fila.usdMillones).toBeCloseTo(1.563, 6);
    expect(fila.tm).toBeCloseTo(2.5, 6);
    expect(fila.filasOrigen).toBe(2);
    expect(fila.subpartida).toBe("0101210000");
  });

  it("mantiene separadas claves distintas (otro destino)", () => {
    const agg = new AgregadorComercio();
    const base = normalizarFila(FILA_REAL)!;
    agg.add(base);
    agg.add({ ...base, paisCodigo: "EC", paisNombre: "ECUADOR" });
    expect(agg.filas).toBe(2);
  });
});

describe("normalizarComtrade (UN Comtrade)", () => {
  it("convierte una fila real del preview (valores en USD, no millones)", () => {
    // Fila real capturada: reporter 604 (Perú), 2024, flujo X, cmd '04', partner '0' (Mundo).
    const fila = normalizarComtrade({
      refYear: 2024,
      flowCode: "X",
      reporterCode: 604,
      partnerCode: 0,
      cmdCode: "04",
      fobvalue: 59640824.607,
      cifvalue: null,
      primaryValue: 59640824.607,
      netWgt: 0,
      isNetWgtEstimated: false,
      isAggregate: true,
    });
    expect(fila).toEqual({
      anio: 2024,
      flujo: "X",
      reporterCode: "604",
      partnerCode: "0",
      cmdCode: "04",
      fobUsd: 59640824.607,
      cifUsd: null,
      primaryUsd: 59640824.607,
      netWgtKg: 0,
      esEstimado: false,
      esAgregado: true,
    });
  });

  it("arma la URL con listas separadas por coma (formato que acepta el preview)", () => {
    const url = buildComtradeUrl({ reporter: "604", anio: 2024, flujo: "X", partners: ["0", "842"], cmds: ["TOTAL", "04"] });
    expect(url).toContain("reporterCode=604");
    expect(url).toContain("partnerCode=0%2C842");
    expect(url).toContain("cmdCode=TOTAL%2C04");
    expect(url).toContain("flowCode=X");
  });

  it("parte partners en lotes bajo el límite de 500 filas del preview", () => {
    // 15 partners × 46 cmds = 690 filas: el request único salía truncado a 500
    // sin aviso (verificado en vivo 2026-10-15). Con margen de 450: lotes de 9.
    const partners = Array.from({ length: 15 }, (_, i) => String(i));
    const lotes = lotesPorFila(partners, 46);
    expect(lotes.map((l) => l.length)).toEqual([9, 6]);
    expect(lotes.flat()).toHaveLength(15);
    // Nunca un lote que pueda superar el límite.
    for (const lote of lotes) expect(lote.length * 46).toBeLessThanOrEqual(450);
  });

  it("partirLotes cubre todos los ítems aunque no dividan exacto", () => {
    expect(partirLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(partirLotes([], 3)).toEqual([]);
  });
});

describe("normalizarWdi (Banco Mundial)", () => {
  it("convierte una fila real de la API", () => {
    // Fila real capturada: NE.EXP.GNFS.ZS, Perú, 2024 = 28.8839339520309.
    const fila = normalizarWdi({
      indicator: { id: "NE.EXP.GNFS.ZS", value: "Exports of goods and services (% of GDP)" },
      country: { id: "PE", value: "Peru" },
      countryiso3code: "PER",
      date: "2024",
      value: 28.8839339520309,
    });
    expect(fila).toEqual({
      paisCodigo: "PE",
      paisIso3: "PER",
      paisNombre: "Peru",
      indicadorCodigo: "NE.EXP.GNFS.ZS",
      indicadorNombre: "Exports of goods and services (% of GDP)",
      anio: 2024,
      valor: 28.8839339520309,
      fuenteActualizada: "",
    });
  });

  it("un indicador por request y varios países por request (lo que acepta la API)", () => {
    const url = buildWdiUrl({ paises: ["PER", "CHN"], indicador: "NY.GDP.MKTP.CD", desde: 2015, hasta: 2024 });
    expect(url).toBe(
      "https://api.worldbank.org/v2/country/PER;CHN/indicator/NY.GDP.MKTP.CD?format=json&date=2015%3A2024&per_page=20000"
    );
  });
});
