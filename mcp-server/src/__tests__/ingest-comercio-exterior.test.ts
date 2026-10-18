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
import { buildUrl as buildWdiUrl, normalizarWdi, parseArgs as parseWdiArgs, INDICADORES_WGI } from "../ingest/wdi-contexto.js";
import { parseAtlasCsv } from "../ingest/atlas-rankings.js";
import { LSCI_COLUMNAS, parseLsciCsv } from "../ingest/lsci.js";
import { leerSharedStrings, parsePillarScore } from "../ingest/bready.js";
import { deflateRawSync } from "node:zlib";
import { readZipEntries } from "../ingest/zip-entries.js";

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

  it("parte socios en lotes considerando los dos flujos (X,M) por capítulo", () => {
    // 6 socios × 2 flujos × 46 cmds = 552 filas por request: con margen preview
    // (450) se parten en lotes de a 4; con margen con clave (18000) cabe todo.
    const socios = ["156", "842", "724", "276", "699", "76"];
    const preview = lotesPorFila(socios, 92);
    expect(preview.map((l) => l.length)).toEqual([4, 2]);
    for (const lote of preview) expect(lote.length * 92).toBeLessThanOrEqual(450);
    expect(lotesPorFila(socios, 92, 18000)).toEqual([socios]);
    // La URL de socios junta varios reporters y los dos flujos en un request.
    const url = buildComtradeUrl({
      reporter: "156,842",
      anio: 2024,
      flujo: "X,M",
      partners: ["0"],
      cmds: ["TOTAL", "04"],
    });
    expect(url).toContain("reporterCode=156%2C842");
    expect(url).toContain("flowCode=X%2CM");
    expect(url).toContain("partnerCode=0");
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

  it("normaliza una fila real de WGI (misma forma que WDI)", () => {
    // Capturada el 2026-10-17: GOV_WGI_CC.EST, Perú, 2024 = -0.710741, lastupdated 2026-09-25.
    const fila = normalizarWdi({
      indicator: { id: "GOV_WGI_CC.EST", value: "Control of Corruption - Governance estimate (approx. -2.5 to +2.5)" },
      country: { id: "PE", value: "Peru" },
      countryiso3code: "PER",
      date: "2024",
      value: -0.710741,
    });
    expect(fila?.indicadorCodigo).toBe("GOV_WGI_CC.EST");
    expect(fila?.paisIso3).toBe("PER");
    expect(fila?.anio).toBe(2024);
    expect(fila?.valor).toBe(-0.710741);
  });

  it("el default no pide country/all: 15 países, 2015-2024, macro y WGI juntos", () => {
    const args = parseWdiArgs(["node", "wdi-contexto.ts"]);
    expect(args.paises).toHaveLength(15);
    expect(args.paises).not.toContain("all");
    expect(args.desde).toBe(2015);
    expect(args.hasta).toBe(2024);
    expect(args.indicadores).toContain("NY.GDP.MKTP.CD");
    expect(args.indicadores).toContain("GOV_WGI_CC.EST");
  });

  it("--wgi-completo pide los 6 indicadores, todos los países y 1996-2025", () => {
    const args = parseWdiArgs(["node", "wdi-contexto.ts", "--wgi-completo"]);
    expect(args.paises).toEqual(["all"]);
    expect(args.desde).toBe(1996);
    expect(args.hasta).toBe(2025);
    expect(args.indicadores).toEqual([...INDICADORES_WGI]);
    expect(args.indicadores).not.toContain("NY.GDP.MKTP.CD");
    const url = buildWdiUrl({
      paises: args.paises,
      indicador: args.indicadores[0],
      desde: args.desde,
      hasta: args.hasta,
    });
    expect(url).toBe(
      "https://api.worldbank.org/v2/country/all/indicator/GOV_WGI_CC.EST?format=json&date=1996%3A2025&per_page=20000"
    );
    expect(url).not.toContain("ALL");
  });
});

const ATLAS_HEADER =
  "country_id,country_iso3_code,year,growth_proj,in_rankings,eci_sitc,eci_rank_sitc,eci_hs92,eci_rank_hs92,eci_hs12,eci_rank_hs12";

describe("parseAtlasCsv (Growth Lab V12)", () => {
  it("lee la fila real de Afganistán 1995 y deja vacíos en null", () => {
    const filas = parseAtlasCsv(`${ATLAS_HEADER}\n4,AFG,1995,,True,-0.616,102,-0.601,100,,\n`);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      countryId: 4,
      paisIso3: "AFG",
      anio: 1995,
      growthProj: null,
      inRankings: true,
      eciSitc: -0.616,
      eciRankSitc: 102,
      eciHs92: -0.601,
      eciRankHs92: 100,
      eciHs12: null,
      eciRankHs12: null,
      vintage: "V12",
      archivo: "growth_proj_eci_rankings.csv",
    });
  });

  it("rechaza un encabezado distinto al de V12", () => {
    expect(() => parseAtlasCsv("country,year\nAFG,1995\n")).toThrow(/Encabezado de Atlas/);
  });
});

const LSCI_HEADER = LSCI_COLUMNAS.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",");

describe("parseLsciCsv (US.LSCI)", () => {
  it("de la fila real de Perú 2006Q01 solo guarda índice y ranking", () => {
    const linea =
      '2006Q01,"Q1 2006",604,"Peru",78.65029,,,,,"No value reported or collected",,,"No value reported or collected",51,,';
    const filas = parseLsciCsv(`${LSCI_HEADER}\n${linea}\n`);
    expect(filas.map((f) => [f.indicador, f.valor])).toEqual([
      ["index", 78.65029],
      ["ranking", 51],
    ]);
    expect(filas[0]).toMatchObject({
      economiaCodigo: "604",
      economiaNombre: "Peru",
      periodo: "2006Q01",
      periodoEtiqueta: "Q1 2006",
      archivo: "US_LSCI.csv",
    });
  });

  it("guarda las tasas cuando el trimestre las trae", () => {
    const linea =
      '2026Q03,"Q3 2026",887,"Yemen",33.3198,,,-12.5425,,,-10.2241,,,106,,';
    const filas = parseLsciCsv(`${LSCI_HEADER}\n${linea}\n`);
    expect(filas.map((f) => f.indicador)).toEqual(["index", "growth_yoy", "growth_previous", "ranking"]);
    expect(filas.find((f) => f.indicador === "growth_yoy")?.valor).toBe(-12.5425);
  });
});

describe("parsePillarScore (B-READY 2025)", () => {
  it("parte la fila real de Angola en tres pilares y no inventa tema", () => {
    const shared = leerSharedStrings(
      "<sst><si><t>Economy</t></si><si><t>Angola</t></si><si><t>Economy Code</t></si><si><t>AGO</t></si>" +
        "<si><t>Pillar 1\nRegulatory Framework</t></si><si><t>Pillar 2\nPublic Services</t></si>" +
        "<si><t>Pillar 3\nOperational Efficiency</t></si></sst>",
    );
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c><c r="C1" t="s"><v>4</v></c>' +
      '<c r="D1" t="s"><v>5</v></c><c r="E1" t="s"><v>6</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>3</v></c>' +
      "<c r=\"C2\"><v>63.878693983831759</v></c><c r=\"D2\"><v>37.480305435305432</v></c>" +
      "<c r=\"E2\"><v>45.851326532361043</v></c></row>";
    const filas = parsePillarScore(sheet, shared);
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f.pilar)).toEqual([
      "Pillar 1 Regulatory Framework",
      "Pillar 2 Public Services",
      "Pillar 3 Operational Efficiency",
    ]);
    expect(filas[0]).toMatchObject({
      economia: "Angola",
      economiaCodigo: "AGO",
      edicion: "2025",
      tema: "",
      indicador: "pillar_score",
      valor: 63.878693983831759,
    });
  });

  it("acepta el salto CRLF del encabezado del xlsx real", () => {
    const shared = leerSharedStrings(
      "<sst><si><t>Economy</t></si><si><t>Economy Code</t></si>" +
        "<si><t>Pillar 1\r\nRegulatory Framework</t></si>" +
        "<si><t>Pillar 2\r\nPublic Services</t></si>" +
        "<si><t>Pillar 3\r\nOperational Efficiency</t></si>" +
        "<si><t>Angola</t></si><si><t>AGO</t></si></sst>",
    );
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>' +
      '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c>' +
      "<c r=\"C2\"><v>63.878693983831759</v></c><c r=\"D2\"><v>37.480305435305432</v></c>" +
      "<c r=\"E2\"><v>45.851326532361043</v></c></row>";
    const filas = parsePillarScore(sheet, shared);
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({ economiaCodigo: "AGO", valor: 63.878693983831759 });
  });

  it("rechaza un encabezado distinto", () => {
    const shared = ["Otro"];
    const sheet = '<row r="1"><c r="A1" t="s"><v>0</v></c></row>';
    expect(() => parsePillarScore(sheet, shared)).toThrow(/Encabezado B-READY/);
  });
});

describe("readZipEntries", () => {
  it("lee una entrada store", () => {
    const name = Buffer.from("hola.txt");
    const data = Buffer.from("abc");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const zip = Buffer.concat([header, name, data]);
    expect(readZipEntries(zip).get("hola.txt")?.toString()).toBe("abc");
  });

  it("lee una entrada deflate cuyo tamaño está en el data descriptor", () => {
    const name = Buffer.from("02_B-READY-2025-EconomyAnswer.xlsx");
    const data = Buffer.from("puntajes");
    const comp = deflateRawSync(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(0x08, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(name.length, 26);
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(comp.length, 8);
    desc.writeUInt32LE(data.length, 12);
    const zip = Buffer.concat([header, name, comp, desc]);
    expect(readZipEntries(zip).get("02_B-READY-2025-EconomyAnswer.xlsx")?.toString()).toBe("puntajes");
  });
});
