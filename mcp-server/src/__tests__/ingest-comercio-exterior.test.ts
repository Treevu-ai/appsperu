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
import { parseBaciCsv, rechazarPanelMundial, aniosPedidos, exportadorPedido } from "../ingest/baci.js";
import { GRAVITY_COLUMNAS, parseGravityCsv, parseRtaCoverage, parseRtaType } from "../ingest/gravity.js";
import { exigirClaveCiudad, parseGeoDiadas, parseGeoPaises } from "../ingest/geodist.js";
import { parseTrains, urlTrains } from "../ingest/trains.js";
import { parseDoingBusiness } from "../ingest/doing-business.js";
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

describe("parseBaciCsv (HS92 V202601)", () => {
  const header = "t,i,j,k,v,q";
  const peru = "2024,604,8,070920,4.625,2.852";
  const otro = "2024,4,24,080810,0.176,0.1";

  it("guarda la fila real de Perú 2024 y descarta el exportador 4", () => {
    const filas = parseBaciCsv(`${header}\n${otro}\n${peru}\n`);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      anio: 2024,
      exportador: 604,
      importador: 8,
      hs6: "070920",
      valorMilesUsd: 4.625,
      cantidad: 2.852,
      vintage: "202601",
      archivo: "BACI_HS92_Y2024_V202601.csv",
    });
  });

  it("rechaza un encabezado distinto y el panel mundial", () => {
    expect(() => parseBaciCsv("year,exporter\n2024,604\n")).toThrow(/Encabezado BACI/);
    expect(() => rechazarPanelMundial(["--mundo"])).toThrow(/10580049/);
    expect(aniosPedidos(["--anio", "2024"])).toEqual([2024]);
    expect(exportadorPedido([])).toBe(604);
  });
});

const GEO_PAIS =
  "iso2,iso3,cnum,country,pays,area,dis_int,landlocked,continent,city_en,city_fr,lat,lon,cap,maincity,citynum,langoff_1,langoff_2,langoff_3,lang20_1,lang20_2,lang20_3,lang20_4,lang9_1,lang9_2,lang9_3,lang9_4,colonizer1,colonizer2,colonizer3,colonizer4,short_colonizer1,short_colonizer2,short_colonizer3";
const GEO_DIADA =
  "iso_o,iso_d,contig,comlang_off,comlang_ethno,colony,comcol,curcol,col45,smctry,dist,distcap,distw,distwces";

describe("parseGravityCsv (V202211)", () => {
  const header = GRAVITY_COLUMNAS.map((c) => `"${c}"`).join(",");
  const aruba =
    '1948,"ABW","ABW","ABW","ABW",533,533,0,0,,,,,,,,"","",,,,,,,,,,,,,,,,,,,,,,,"",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';

  it("proyecta la fila real ABW-ABW 1948 y deja el acuerdo vacío en null", () => {
    expect(GRAVITY_COLUMNAS).toHaveLength(87);
    const filas = parseGravityCsv(`${header}\n${aruba}\n`);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      anio: 1948,
      countryIdO: "ABW",
      countryIdD: "ABW",
      iso3O: "ABW",
      iso3D: "ABW",
      countryExistsO: 0,
      countryExistsD: 0,
      ftaWto: null,
      ftaWtoRaw: null,
      rtaCoverage: null,
      rtaType: null,
      vintage: "202211",
    });
  });

  it("lee las etiquetas reales y rechaza otro encabezado", () => {
    const tipos = parseRtaType(
      "rta_type,rta_type_lbl\n1,CU\n2,CU & EIA\n3,EIA\n4,FTA\n5,FTA & EIA\n7,PSA & EIA\n",
    );
    expect(tipos.map((t) => [t.codigo, t.etiqueta])).toEqual([
      ["1", "CU"],
      ["2", "CU & EIA"],
      ["3", "EIA"],
      ["4", "FTA"],
      ["5", "FTA & EIA"],
      ["7", "PSA & EIA"],
    ]);
    const cob = parseRtaCoverage("rta_coverage,rta_coverage_lbl\n1,Goods\n2,Goods & Services\n3,Services\n");
    expect(cob[1]).toMatchObject({ variable: "rta_coverage", codigo: "2", etiqueta: "Goods & Services" });
    expect(() => parseGravityCsv("year,iso3_o\n1948,ABW\n")).toThrow(/Encabezado Gravity/);
  });
});

describe("parseGeoDist", () => {
  it("lee la fila real de Perú en geo_cepii y deja el punto como null", () => {
    const fila =
      "PE,PER,604.0,Peru,Pérou,1285216.0,426.4046,0.0,America,Lima,Lima,-12.1,-77.05,1.0,1.0,25.0,Spanish,.,.,Spanish,.,.,.,Quecha,.,.,.,ESP,.,.,.,.,.,.";
    const paises = parseGeoPaises(`${GEO_PAIS}\n${fila}\n`);
    expect(paises).toHaveLength(1);
    expect(paises[0]).toMatchObject({
      iso2: "PE",
      iso3: "PER",
      cnum: 604,
      pays: "Pérou",
      area: 1285216,
      lat: -12.1,
      lon: -77.05,
      landlocked: 0,
      lang91: "Quecha",
      colonizer1: "ESP",
      langoff2: null,
      shortColonizer1: null,
      archivo: "geo_cepii.xls",
    });
  });

  it("lee la díada real PER-ABW de dist_cepii", () => {
    const fila = "PER,ABW,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,2848.861,2848.861,2758.858,2724.569";
    const diadas = parseGeoDiadas(`${GEO_DIADA}\n${fila}\n`);
    expect(diadas[0]).toMatchObject({
      isoO: "PER",
      isoD: "ABW",
      contig: 0,
      comlangOff: 1,
      colony: 0,
      dist: 2848.861,
      distwces: 2724.569,
      archivo: "dist_cepii.xls",
    });
  });

  it("rechaza un encabezado distinto", () => {
    expect(() => parseGeoPaises("iso3,country\nPER,Peru\n")).toThrow(/Encabezado GeoDist/);
    expect(() => parseGeoDiadas("iso_o,dist\nPER,1\n")).toThrow(/Encabezado GeoDist/);
  });

  it("conserva las dos ciudades reales de Australia y de Tanzania", () => {
    const sydney =
      "AU,AUS,36.0,Australia,Australie,7686848.0,1042.817,0.0,Pacific,Sydney,Sydney,-33.88334,151.1667,0.0,1.0,25.0,English,.,.,English,.,.,.,.,.,.,.,GBR,.,.,.,.,.,.";
    const canberra =
      "AU,AUS,36.0,Australia,Australie,7686848.0,1042.817,0.0,Pacific,Canberra,Canberra,-35.3,149.133,1.0,0.0,25.0,English,.,.,English,.,.,.,.,.,.,.,GBR,.,.,.,.,.,.";
    const tzaCosta =
      'TZ,TZA,834.0,"Tanzania, United Rep. of ",Tanzanie,945090.0,365.6541,0.0,Africa,Dar es Salaam,Dar es Salaam,-6.85,39.3,2.0,1.0,25.0,English,Swahili,.,Swahili,.,.,.,Sukuma,.,.,.,GBR,.,.,.,.,.,.';
    const tzaInterior =
      'TZ,TZA,834.0,"Tanzania, United Rep. of ",Tanzanie,945090.0,365.6541,0.0,Africa,Dar es Salaam,Dar es Salaam,-6.17,35.74,1.0,0.0,25.0,English,Swahili,.,Swahili,.,.,.,Sukuma,.,.,.,GBR,.,.,.,.,.,.';
    const paises = parseGeoPaises(`${GEO_PAIS}\n${sydney}\n${canberra}\n${tzaCosta}\n${tzaInterior}\n`);
    expect(paises).toHaveLength(4);
    expect(paises[0]).toMatchObject({ iso3: "AUS", cityEn: "Sydney", cap: 0, maincity: 1, lat: -33.88334 });
    expect(paises[1]).toMatchObject({ iso3: "AUS", cityEn: "Canberra", cap: 1, maincity: 0, lat: -35.3 });
    expect(paises[2]).toMatchObject({
      iso3: "TZA", cityEn: "Dar es Salaam", cap: 2, maincity: 1, lat: -6.85,
      country: "Tanzania, United Rep. of ",
    });
    expect(paises[3]).toMatchObject({ iso3: "TZA", cityEn: "Dar es Salaam", cap: 1, maincity: 0, lat: -6.17 });
    expect(() => exigirClaveCiudad(paises)).not.toThrow();
    expect(() => exigirClaveCiudad([...paises, paises[1]])).toThrow(/AUS cap=1 maincity=0/);
  });
});

const ATRIBUTOS_TRAINS = [
  { id: "NOMENCODE", values: [{ id: "H5" }] },
  { id: "EXCLUDEDFROM", values: [] },
  { id: "TARIFFTYPE", values: [{ id: "MFN" }] },
  { id: "SUM_OF_RATES", values: ["0", "12", "6", "24", "11", "22", "18", "17"].map((id) => ({ id })) },
  { id: "MIN_RATE", values: ["0", "6", "11"].map((id) => ({ id })) },
  { id: "MAX_RATE", values: ["0", "6", "11"].map((id) => ({ id })) },
  { id: "TOTALNOOFLINES", values: ["1", "2", "4", "3", "7", "6", "5", "8", "15", ""].map((id) => ({ id })) },
  { id: "NBR_PREF_LINES", values: [{ id: "0" }] },
  { id: "NBR_MFN_LINES", values: ["1", "2", "4", "3", "7", "6", "5", "8", "15", ""].map((id) => ({ id })) },
  { id: "NBR_NA_LINES", values: [{ id: "0" }, { id: "" }] },
  { id: "OBS_VALUE_MEASURE", values: [{ id: "SimpleAverage" }] },
];

function docTrains(
  productos: { id: string; name: string }[],
  series: Record<string, unknown[]>,
): unknown {
  return {
    header: { id: "DF_WITS_Tariff_TRAINS", prepared: "2026-10-17T23:00:26", sender: { id: "WBG_WITS" } },
    dataSets: [{
      series: Object.fromEntries(Object.entries(series).map(([clave, arr]) => [clave, { observations: { "0": arr } }])),
    }],
    structure: {
      name: "WITS - UNCTAD TRAINS Tariff Data",
      dimensions: {
        series: [
          { id: "FREQ", keyPosition: 0, values: [{ id: "A", name: "Annual" }] },
          { id: "REPORTER", keyPosition: 1, values: [{ id: "604", name: "Peru" }] },
          { id: "PARTNER", keyPosition: 2, values: [{ id: "000", name: "World" }] },
          { id: "PRODUCTCODE", keyPosition: 3, values: productos },
          { id: "DATATYPE", keyPosition: 4, values: [{ id: "Reported", name: "Reported Tariff (Not estimated)" }] },
        ],
        observation: [{ id: "TIME_PERIOD", values: [{ id: "2021", name: "2021" }] }],
      },
      attributes: { observation: ATRIBUTOS_TRAINS },
    },
  };
}

describe("parseTrains", () => {
  const productos = [
    { id: "010121", name: "(2012-) -- Pure-bred breeding animals" },
    { id: "010129", name: "(2012-) -- Other" },
    { id: "010130", name: "(2012-) - Asses" },
    { id: "010190", name: "(2002-) - Other" },
    { id: "010221", name: "(2012-) -- Pure-bred breeding animals" },
    { id: "010229", name: "(2012-) -- Other" },
  ];

  it("lee el producto del tercer campo de la clave, no de keyPosition", () => {
    const filas = parseTrains(docTrains(productos, {
      "0:0:0:0:0": [0, 0, null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "0:0:5:0:0": [3, 0, null, 0, 2, 0, 1, 1, 0, 1, 0, 0],
    }));
    expect(filas).toHaveLength(2);
    expect(filas.find((f) => f.producto === "010229")).toMatchObject({
      anio: 2021,
      reporter: "604",
      partner: "000",
      productoNombre: "(2012-) -- Other",
      datatype: "Reported",
      nomenclatura: "H5",
      tipoArancel: "MFN",
      promedioSimple: 3,
      sumaTasas: 6,
      tasaMin: 0,
      tasaMax: 6,
      lineasTotal: 2,
      lineasPreferenciales: 0,
      lineasMfn: 2,
      lineasNa: 0,
      medida: "SimpleAverage",
      excluidoDe: null,
      consultado: "2026-10-17T23:00:26",
    });
    expect(filas.find((f) => f.producto === "010121")?.promedioSimple).toBe(0);
  });

  it("conserva el promedio 8.5 capturado en 021092", () => {
    const filas = parseTrains(docTrains(
      [{
        id: "021092",
        name: "(2002-) -- Of whales, dolphins and porpoises (mammals of the order Cetacea); of manatees and dugongs (mammals of the order Sirenia); of seals, sea lions and walruses (mammals of the suborder Pinnipedia)",
      }],
      { "0:0:0:0:0": [8.5, 0, null, 0, 7, 1, 2, 1, 0, 1, 0, 0] },
    ));
    expect(filas[0]).toMatchObject({
      producto: "021092",
      promedioSimple: 8.5,
      sumaTasas: 17,
      tasaMin: 6,
      tasaMax: 11,
      lineasTotal: 2,
    });
  });

  it("deja en null el conteo de líneas vacío de 271000", () => {
    const nombre = "(-2001) Petroleum oils and oils obtained from bituminous minerals, other than crude; preparations not elsewhere specified or included, containing by weight 70 % or more of petroleum oils or of oils obtained from bituminous minerals, these oils being the b";
    const filas = parseTrains(docTrains(
      [{ id: "271000", name: nombre }],
      { "0:0:0:0:0": [0, 0, null, 0, 0, 0, 0, 9, 0, 9, 1, 0] },
    ));
    expect(filas[0].productoNombre).toHaveLength(255);
    expect(filas[0].lineasTotal).toBeNull();
    expect(filas[0].lineasMfn).toBeNull();
    expect(filas[0].lineasNa).toBeNull();
    expect(filas[0].promedioSimple).toBe(0);
  });

  it("rechaza otra forma y una clave con dos ranuras variables", () => {
    expect(() => parseTrains({ header: { id: "otro" } })).toThrow(/Encabezado TRAINS/);
    expect(() => parseTrains(docTrains(productos.slice(0, 2), {
      "0:0:0:0:0": [0, 0, null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      "0:0:1:1:0": [0, 0, null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    }))).toThrow(/Ranura de producto TRAINS/);
    expect(urlTrains("604", "000", 2021)).toBe(
      "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/reporter/604/partner/000/product/All/year/2021/datatype/reported?format=JSON",
    );
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

describe("parseDoingBusiness", () => {
  function fila(ancho: number, celdas: Record<number, string>): string[] {
    const out = Array.from({ length: ancho }, () => "");
    for (const [k, v] of Object.entries(celdas)) out[Number(k)] = v;
    return out;
  }

  const ancho = 189;
  const temas = fila(ancho, {
    5: "Ease of doing business",
    9: "Starting a business",
    25: "Dealing with construction permits",
    42: "Getting electricity",
    186: "Resolving insolvency",
  });
  const header = fila(ancho, {
    0: "Country code",
    1: "Economy",
    2: "Region",
    3: "Income group",
    4: "DB Year",
    5: "Ease of doing business rank",
    6: "Ease of doing business score (DB17-20 methodology)",
    11: "Procedures - Men (number)",
    28: "Procedures (number)",
    36: "Quality of building regulations index (0-2) (DB16-20 methodology)",
    46: "Procedures (number)",
    59: "System average interruption duration index (SAIDI) (DB16-20 methodology)",
    188: "Outcome (0 as piecemeal sale and 1 as going concern)",
  });
  const identidad = {
    1: "Peru",
    2: "Latin America & Caribbean",
    3: "Upper middle income",
  };

  it("separa indicadores homónimos y conserva notas y el punto inicial", () => {
    const filas = parseDoingBusiness([
      temas,
      header,
      fila(ancho, { 0: "PER", ...identidad, 4: "2020", 5: "76", 6: "68.69658", 11: "8" }),
      fila(ancho, { 0: "AFG", 1: "Afghanistan", 2: "South Asia", 3: "Low income", 4: "2020", 28: "13", 46: "50", 59: ".." }),
      fila(ancho, { 0: "AFG", 1: "Afghanistan", 2: "South Asia", 3: "Low income", 4: "2018", 36: ".5" }),
      fila(ancho, { 0: "AFG", 1: "Afghanistan", 2: "South Asia", 3: "Low income", 4: "2007", 188: "No Practice" }),
    ]);
    const per = filas.filter((f) => f.countryCode === "PER");
    expect(per).toHaveLength(3);
    expect(per.find((f) => f.indicador.startsWith("Ease of doing business score"))?.valor).toBeCloseTo(68.69658);
    expect(per.find((f) => f.indicador === "Procedures - Men (number)")?.valor).toBe(8);
    const procedimientos = filas.filter((f) => f.indicador === "Procedures (number)");
    expect(procedimientos.map((f) => [f.tema, f.valor])).toEqual([
      ["Dealing with construction permits", 13],
      ["Getting electricity", 50],
    ]);
    const punto = filas.find((f) => f.indicador.startsWith("Quality of building regulations"));
    expect(punto?.valor).toBe(0.5);
    expect(punto?.nota).toBeNull();
    const saidi = filas.find((f) => f.indicador.startsWith("System average interruption"));
    expect(saidi?.valor).toBeNull();
    expect(saidi?.nota).toBe("..");
    const outcome = filas.find((f) => f.indicador.startsWith("Outcome"));
    expect(outcome?.tema).toBe("Resolving insolvency");
    expect(outcome?.nota).toBe("No Practice");
    expect(outcome?.dbYear).toBe(2007);
  });

  it("rechaza un encabezado distinto", () => {
    const malo = fila(ancho, { 0: "Country code", 1: "Pais" });
    expect(() => parseDoingBusiness([temas, malo])).toThrow(/Encabezado Doing Business/);
  });

  it("omite la nota al pie y rechaza un año vacío con indicadores", () => {
    const nota = fila(ancho, {
      0: "Note: This file updates the historical dataset containing data up to DB20.",
    });
    const filas = parseDoingBusiness([
      temas,
      header,
      fila(ancho, { 0: "PER", ...identidad, 4: "2020", 5: "76" }),
      nota,
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0].countryCode).toBe("PER");
    const conDato = fila(ancho, { 0: "AFG", 1: "Afghanistan", 2: "South Asia", 3: "Low income", 59: ".." });
    expect(() => parseDoingBusiness([temas, header, conDato])).toThrow(/Año DB ilegible/);
  });
});
