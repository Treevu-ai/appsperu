/**
 * Normalizadores para los XLSX del Anuario SUNAT (formato xlsx).
 *
 * cdro_15 — Importaciones CIF por aduana (trimestral + total anual)
 *   Estructura: [codigo, nombre_aduana, trim1_2023, trim2_2023, trim3_2023, trim4_2023, total_2023,
 *                trim1_2024, trim2_2024, trim3_2024, trim4_2024, total_2024]
 *
 * cdro_16 — Importaciones FOB+CIF por aduana + subpartida
 *   Estructura: [aduana_name, empty, idx, subpartida, desc, fob2023, fob2024, cif2023, cif2024, var_pct, estructura]
 *   Filas "Total XXXX" son headers de grupo
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Cdro15Row {
  aduana_code: number;
  aduana_name: string;
  year: number;
  quarter: number | null; // null = total anual
  is_total: boolean;
  value_cif_usd: number;
}

export interface Cdro16Row {
  aduana_code: number;
  aduana_name: string;
  year: number;
  subpartida: string;
  product_desc: string;
  value_fob_usd: number;
  value_cif_usd: number;
  pct_change: number | null;
  pct_structure: number | null;
}

import XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function clean(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

// xlsx sheet_to_json con header:1 devuelve arrays
type RawRow = unknown[];
type Sheet = { [key: string]: RawRow };

/** Códigos de aduanas conocidos (SUNAT) */
export const KNOWN_ADUANA_CODES: { [key: string]: number } = {
  "MARITIMA DEL CALLAO": 1,
  "AEREA Y POSTAL EX - IAAC": 2,
  "MOLLENDO - MATARANI": 3,
  "TACNA": 4,
  "PAITA": 5,
  "PISCO": 6,
  "TALARA": 7,
  "SALAVERRY": 8,
  "DESAGUADERO": 9,
  "ILO": 10,
  "CHIMBOTE": 11,
  "TUMBES": 12,
  "PUCALLPA": 13,
  "IQUITOS": 14,
  "PUERTO MALDONADO": 15,
  "SANTA CRUZ": 16,
  "YAVARI": 17,
  "JUANJUI": 18,
};

export function findKnownAduanaCode(name: string): number {
  const normalized = name.toUpperCase().trim();
  if (KNOWN_ADUANA_CODES[normalized]) return KNOWN_ADUANA_CODES[normalized];
  for (const [key, code] of Object.entries(KNOWN_ADUANA_CODES)) {
    if (normalized.includes(key) || key.includes(normalized)) return code;
  }
  // Fallback: hash estable
  let hash = 0;
  for (const c of normalized) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return (Math.abs(hash) % 900) + 100;
}

// ---------------------------------------------------------------------------
// cdro_15
// Estructura detectada:
//   Fila 6 (idx 5): header "Aduana | Periodo 2023 | ... | Periodo 2024 | ..."
//   Fila 7 (idx 6): subheader "  | I Trim | II Trim | III Trim | IV Trim | TOTAL | ..."
//   Fila 8 (idx 7): TOTAL nacional
//   Fila 9+ (idx 8+): filas por aduana
//   cols (0-indexed):
//     [0]=empty, [1]=codigo, [2]=nombre_aduana,
//     [3]=trim1_2023, [4]=trim2_2023, [5]=trim3_2023, [6]=trim4_2023, [7]=total_2023,
//     [8]=trim1_2024, [9]=trim2_2024, [10]=trim3_2024, [11]=trim4_2024, [12]=total_2024
// ---------------------------------------------------------------------------

export function normalizeCdro15(ws: Sheet): Cdro15Row[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];

  const result: Cdro15Row[] = [];

  // Datos arrancan en índice 6 (TOTAL nacional en 6, aduanas en 7+)
  // Con xlsx + header:1 las merged cells se compactan:
  //   [0]=codigo, [1]=nombre_aduana,
  //   [2]=trim1_2023, [3]=trim2_2023, [4]=trim3_2023, [5]=trim4_2023, [6]=total_2023,
  //   [7]=trim1_2024, [8]=trim2_2024, [9]=trim3_2024, [10]=trim4_2024, [11]=total_2024
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const codigoRaw = clean(row[0]);
    const nombre = clean(row[1]);

    // Skip header rows (no numeric code, or name is header text)
    if (!codigoRaw || !nombre || nombre === "" || !Number.isInteger(parseInt(codigoRaw, 10))) continue;

    const codigo = parseInt(codigoRaw, 10);

    const quarters2023 = [
      { q: 1, val: num(row[2]) },
      { q: 2, val: num(row[3]) },
      { q: 3, val: num(row[4]) },
      { q: 4, val: num(row[5]) },
    ];
    const total2023 = num(row[6]);
    const quarters2024 = [
      { q: 1, val: num(row[7]) },
      { q: 2, val: num(row[8]) },
      { q: 3, val: num(row[9]) },
      { q: 4, val: num(row[10]) },
    ];
    const total2024 = num(row[11]);

    for (const { q, val } of quarters2023) {
      result.push({ aduana_code: codigo, aduana_name: nombre, year: 2023, quarter: q, is_total: false, value_cif_usd: val });
    }
    result.push({ aduana_code: codigo, aduana_name: nombre, year: 2023, quarter: null, is_total: true, value_cif_usd: total2023 });

    for (const { q, val } of quarters2024) {
      result.push({ aduana_code: codigo, aduana_name: nombre, year: 2024, quarter: q, is_total: false, value_cif_usd: val });
    }
    result.push({ aduana_code: codigo, aduana_name: nombre, year: 2024, quarter: null, is_total: true, value_cif_usd: total2024 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// cdro_16
// Estructura detectada:
//   Fila 6 (idx 5): header "Aduana / Subpartidas"
//   Fila 7 (idx 6): subheader con "Valor FOB", "Valor CIF", etc.
//   Filas "Total XXXX" = inicio de grupo (capturar nombre para siguientes subpartidas)
//   Filas con idx numérico en col[1] = detalle de subpartida
//   cols (0-indexed) — verificado en vivo 2026-10-05 contra el XLSX real
//   (`XLSX.utils.sheet_to_json(ws, {header:1})`, sin columna vacía intermedia —
//   el comentario anterior documentaba un `[1]=empty` que no existe en el
//   archivo real, lo que desalineaba todo lo que sigue por una posición):
//     [0]=aduana_name (o "Total XXX"), [1]=idx_num, [2]=subpartida (código,
//     ej. "2709000000"), [3]=descripcion, [4]=fob2023, [5]=fob2024,
//     [6]=cif2023, [7]=cif2024, [8]=var_pct, [9]=estructura
// ---------------------------------------------------------------------------

/**
 * Versión del parser de cdro_16 — incrementar cada vez que cambie la lógica de
 * `normalizeCdro16`. El checksum del XLSX no cambia cuando se corrige el parser, solo cuando
 * cambia el archivo fuente — sin este número, `sunat-connector.ts` saltaría indefinidamente la
 * reingesta de un batch ya existente aunque el parser que lo produjo tuviera un bug ya
 * corregido (hallazgo real de CodeRabbit, bug de columnas desalineadas corregido 2026-10-05).
 */
export const NORMALIZER_VERSION_CDRO16 = 2;

// ---------------------------------------------------------------------------
// Rankings planos (cdro_07, cdro_08, cdro_09, cdro_20) — Fase 1 del plan de
// conexión de las 20 tablas faltantes del Anuario.
//
// Las 4 comparten la misma forma (item + rank + valor FOB(+CIF) + variación%
// + estructura%), verificada en vivo con XLSX.utils.sheet_to_json(ws,
// {header:1}) contra los 4 archivos reales (2026-10-20):
//
//   cdro_07 (subpartidas, import):  fila 6=TOTAL, fila 7+=datos
//     [0]=rank, [1]=subpartida_code, [2]=desc,
//     [3]=fob2023, [4]=fob2024, [5]=cif2023, [6]=cif2024, [7]=var%, [8]=estructura%
//   cdro_08 (empresas importadoras): fila 6=TOTAL, fila 7+=datos
//     [0]=rank, [1]=razon_social,
//     [2]=fob2023, [3]=fob2024, [4]=cif2023, [5]=cif2024, [6]=var%, [7]=estructura%
//   cdro_09 (país origen, import): misma forma que cdro_08
//   cdro_20 (productos tradicionales, export — SIN columna CIF): fila 6=TOTAL, fila 7+=datos
//     [0]=rank, [1]=subpartida_code, [2]=desc,
//     [3]=fob2023, [4]=fob2024, [5]=var%, [6]=estructura%
//
// Solo se persiste 2024 (valor "actual") + pct_change/pct_structure, mismo
// criterio que ya usa normalizeCdro16 — el 2023 crudo se lee pero se
// descarta, no se duplica el dato base que ya vive en pct_change.
// ---------------------------------------------------------------------------

export interface TradeFlatRankingRow {
  source_cdro: string;
  dimension_type: "subpartida" | "empresa" | "pais";
  rank: number;
  dimension_code: string | null;
  dimension_value: string;
  year: number;
  value_fob_usd: number;
  value_cif_usd: number | null;
  pct_change: number | null;
  pct_structure: number | null;
}

interface FlatRankingShape {
  sourceCdro: string;
  dimensionType: TradeFlatRankingRow["dimension_type"];
  hasCode: boolean; // cdro_07/cdro_20 tienen código de subpartida; cdro_08/cdro_09 no
  hasCif: boolean; // cdro_20 (export) no tiene columna CIF
  dataStartRow: number; // primera fila de datos (después de TOTAL)
}

export const FLAT_RANKING_SHAPES: Record<string, FlatRankingShape> = {
  cdro_07: { sourceCdro: "cdro_07", dimensionType: "subpartida", hasCode: true, hasCif: true, dataStartRow: 7 },
  cdro_08: { sourceCdro: "cdro_08", dimensionType: "empresa", hasCode: false, hasCif: true, dataStartRow: 7 },
  cdro_09: { sourceCdro: "cdro_09", dimensionType: "pais", hasCode: false, hasCif: true, dataStartRow: 7 },
  cdro_20: { sourceCdro: "cdro_20", dimensionType: "subpartida", hasCode: true, hasCif: false, dataStartRow: 7 },
};

export const NORMALIZER_VERSION_FLAT_RANKING = 1;

export function normalizeFlatRanking(ws: Sheet, shape: FlatRankingShape): TradeFlatRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeFlatRankingRow[] = [];

  for (let i = shape.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rankRaw = clean(row[0]);
    const rank = parseInt(rankRaw, 10);
    // Filas de pie de página ("-  Cobertura Nacional", "Fuente: ...") no
    // tienen un rank numérico en col[0] — se detienen aquí.
    if (!Number.isInteger(rank)) break;

    let col = 1;
    const code = shape.hasCode ? clean(row[col++]) || null : null;
    const value = clean(row[col++]);
    if (!value) continue;

    const fob2024 = num(row[col + 1]);
    let cif2024: number | null = null;
    if (shape.hasCif) {
      cif2024 = num(row[col + 3]);
      col += 4;
    } else {
      col += 2;
    }
    const pctChange = row[col] != null ? num(row[col]) : null;
    const pctStructure = row[col + 1] != null ? num(row[col + 1]) : null;

    result.push({
      source_cdro: shape.sourceCdro,
      dimension_type: shape.dimensionType,
      rank,
      dimension_code: code,
      dimension_value: value,
      year: 2024,
      value_fob_usd: fob2024,
      value_cif_usd: cif2024,
      pct_change: pctChange,
      pct_structure: pctStructure,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rankings con categoría padre CUODE (cdro_04, cdro_05, cdro_06) — Fase 2.
//
// Forma verificada en vivo (2026-10-20): la categoría CUODE es su PROPIA
// fila con valor agregado (ej. "BIENES DE CONSUMO NO DURADERO" con su FOB/
// CIF propios) — a diferencia de cdro_18/19 (Fase 2 también, pero donde el
// sector viaja embebido en la primera fila de ítem). Se detecta una fila de
// categoría porque col[1] es null (los ítems siempre tienen un rank
// numérico ahí):
//
//   cdro_04 (subpartida, con código): fila 6=TOTAL, fila 7+=categorías/ítems
//     categoría: [0]=label, [1..3]=null, [4]=fob2023,[5]=fob2024,[6]=cif2023,[7]=cif2024,[8]=var%,[9]=estructura%
//     ítem:      [0]=null, [1]=rank, [2]=subpartida_code, [3]=desc, [4..9] igual que categoría
//   cdro_05 (empresa, sin código): fila 6=TOTAL, fila 7+=categorías/ítems
//     categoría: [0]=label, [1..2]=null, [3]=fob2023,[4]=fob2024,[5]=cif2023,[6]=cif2024,[7]=var%,[8]=estructura%
//     ítem:      [0]=null, [1]=rank, [2]=razon_social, [3..8] igual que categoría
//   cdro_06 (país): misma forma que cdro_05
// ---------------------------------------------------------------------------

export interface TradeCuodeRankingRow {
  source_cdro: string;
  cuode_category: string;
  dimension_type: "subpartida" | "empresa" | "pais";
  rank: number;
  dimension_code: string | null;
  dimension_value: string;
  year: number;
  value_fob_usd: number;
  value_cif_usd: number;
  pct_change: number | null;
  pct_structure: number | null;
}

interface CuodeRankingShape {
  sourceCdro: string;
  dimensionType: TradeCuodeRankingRow["dimension_type"];
  hasCode: boolean; // cdro_04 tiene código de subpartida; cdro_05/cdro_06 no
  dataStartRow: number;
}

export const CUODE_RANKING_SHAPES: Record<string, CuodeRankingShape> = {
  cdro_04: { sourceCdro: "cdro_04", dimensionType: "subpartida", hasCode: true, dataStartRow: 7 },
  cdro_05: { sourceCdro: "cdro_05", dimensionType: "empresa", hasCode: false, dataStartRow: 7 },
  cdro_06: { sourceCdro: "cdro_06", dimensionType: "pais", hasCode: false, dataStartRow: 7 },
};

export const NORMALIZER_VERSION_CUODE_RANKING = 1;

function isFooterRow(col0: string): boolean {
  return col0.startsWith("Fuente:") || col0.startsWith("Elaboración:") || col0.startsWith("-  Cobertura");
}

export function normalizeCuodeRanking(ws: Sheet, shape: CuodeRankingShape): TradeCuodeRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeCuodeRankingRow[] = [];
  let currentCategory = "";

  for (let i = shape.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;

    // Fila de categoría: col[1] vacío, col[0] con el nombre de la categoría.
    if (col0 && (row[1] === null || row[1] === undefined)) {
      currentCategory = col0;
      continue;
    }

    const rank = parseInt(clean(row[1]), 10);
    if (!Number.isInteger(rank)) continue;

    let col = 2;
    const code = shape.hasCode ? clean(row[col++]) || null : null;
    const value = clean(row[col++]);
    if (!value || !currentCategory) continue;

    const fob2024 = num(row[col + 1]);
    const cif2024 = num(row[col + 3]);
    col += 4;
    const pctChange = row[col] != null ? num(row[col]) : null;
    const pctStructure = row[col + 1] != null ? num(row[col + 1]) : null;

    result.push({
      source_cdro: shape.sourceCdro,
      cuode_category: currentCategory,
      dimension_type: shape.dimensionType,
      rank,
      dimension_code: code,
      dimension_value: value,
      year: 2024,
      value_fob_usd: fob2024,
      value_cif_usd: cif2024,
      pct_change: pctChange,
      pct_structure: pctStructure,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rankings con sector económico embebido (cdro_18, cdro_19) — Fase 2.
//
// A diferencia de CUODE arriba, el sector NO tiene su propia fila con
// valor agregado — viaja en col[1] solo en la PRIMERA fila de cada grupo
// (ej. "MINERO"), null en las filas siguientes del mismo grupo. Dos tipos
// de fila se descartan sin aportar estado: "Total XXXX" (subtotal de
// sector padre, ej. "Total PRODUCTOS TRADICIONALES") y una fila de un solo
// valor como separador visual (ej. "PRODUCTOS TRADICIONALES" sola).
//
//   cdro_18 (empresa, sin código): fila 6=TOTAL, fila 7="Total PRODUCTOS...",
//     fila 8=separador, fila 9+=ítems
//     ítem: [0]=null, [1]=sector (solo 1ra fila de grupo), [2]=rank,
//           [3]=empresa, [4]=fob2023, [5]=fob2024, [6]=var%, [7]=estructura%
//   cdro_19 (producto, con código): misma forma + [3]=subpartida_code
//     entre rank y descripción
//     ítem: [0]=null, [1]=sector, [2]=rank, [3]=subpartida_code, [4]=desc,
//           [5]=fob2023, [6]=fob2024, [7]=var%, [8]=estructura%
// ---------------------------------------------------------------------------

export interface TradeSectorRankingRow {
  source_cdro: string;
  sector_category: string;
  dimension_type: "subpartida" | "empresa";
  rank: number;
  dimension_code: string | null;
  dimension_value: string;
  year: number;
  value_fob_usd: number;
  pct_change: number | null;
  pct_structure: number | null;
}

interface SectorRankingShape {
  sourceCdro: string;
  dimensionType: TradeSectorRankingRow["dimension_type"];
  hasCode: boolean; // cdro_19 tiene código de subpartida; cdro_18/cdro_17 no
  dataStartRow: number;
  // cdro_17 (Fase 4) tiene la MISMA forma que cdro_18/19 pero con una
  // columna extra al inicio (el rank del sector entre los sectores, ej.
  // [null,1,"MINERO",1,"COBRE",fob2023,fob2024,var%,estructura%] en vez de
  // [null,"MINERO",1,"COMPAÑIA...",...]) — offset=1 desplaza sectorLabel/
  // rank/código/valor una columna a la derecha. El marcador "Total XXXX"
  // también se desplaza (aparece en la misma columna donde iría
  // sectorLabel), así que se busca en cualquier columna hasta 1+offset en
  // vez de asumir siempre col[0].
  offset: number;
}

export const SECTOR_RANKING_SHAPES: Record<string, SectorRankingShape> = {
  cdro_18: { sourceCdro: "cdro_18", dimensionType: "empresa", hasCode: false, dataStartRow: 7, offset: 0 },
  cdro_19: { sourceCdro: "cdro_19", dimensionType: "subpartida", hasCode: true, dataStartRow: 7, offset: 0 },
  cdro_17: { sourceCdro: "cdro_17", dimensionType: "empresa", hasCode: false, dataStartRow: 7, offset: 1 },
};

export const NORMALIZER_VERSION_SECTOR_RANKING = 1;

export function normalizeSectorRanking(ws: Sheet, shape: SectorRankingShape): TradeSectorRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeSectorRankingRow[] = [];
  let currentSector = "";
  const offset = shape.offset;

  for (let i = shape.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;
    if (row.slice(0, 2 + offset).some((c) => clean(c).startsWith("Total "))) continue;
    if (row.length === 1) continue; // separador visual de una sola celda

    const sectorLabel = clean(row[1 + offset]);
    const rank = parseInt(clean(row[2 + offset]), 10);
    if (!Number.isInteger(rank)) continue;
    if (sectorLabel) currentSector = sectorLabel;
    if (!currentSector) continue;

    let col = 3 + offset;
    const code = shape.hasCode ? clean(row[col++]) || null : null;
    const value = clean(row[col++]);
    if (!value) continue;

    const fob2024 = num(row[col + 1]);
    col += 2;
    const pctChange = row[col] != null ? num(row[col]) : null;
    const pctStructure = row[col + 1] != null ? num(row[col + 1]) : null;

    result.push({
      source_cdro: shape.sourceCdro,
      sector_category: currentSector,
      dimension_type: shape.dimensionType,
      rank,
      dimension_code: code,
      dimension_value: value,
      year: 2024,
      value_fob_usd: fob2024,
      pct_change: pctChange,
      pct_structure: pctStructure,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rankings por país (cdro_10, cdro_11, cdro_21, cdro_22) — Fase 3.
//
// Misma matriz hasCode×hasCif que normalizeFlatRanking (Fase 1), pero el
// país viaja embebido en la primera fila de cada grupo — igual patrón que
// sector_category en normalizeSectorRanking (Fase 2), con dos tipos de fila
// a saltar sin aportar estado: "Total XXXX" (subtotal del país, ej. "Total
// CHINA") y la fila de detalle, donde el país real aparece SIN el prefijo
// "Total " (ej. "CHINA") solo en la primera fila del grupo.
//
// Verificado en vivo (2026-10-20) contra los 4 archivos reales:
//   cdro_10 (subpartida, import, con código y CIF):
//     [0]=país(1ra fila) o null, [1]=rank, [2]=subpartida_code, [3]=desc,
//     [4]=fob2023,[5]=fob2024,[6]=cif2023,[7]=cif2024,[8]=var%,[9]=estructura%
//   cdro_11 (empresa/importador, import, sin código, con CIF — 2,006 filas,
//            el archivo más grande del Anuario):
//     [0]=país, [1]=rank, [2]=razon_social,
//     [3]=fob2023,[4]=fob2024,[5]=cif2023,[6]=cif2024,[7]=var%,[8]=estructura%
//   cdro_21 (subpartida, export, con código, SIN CIF): misma forma que
//            cdro_10 sin las columnas [6]=cif2023,[7]=cif2024
//   cdro_22 (empresa/exportador, export, sin código, SIN CIF): misma forma
//            que cdro_11 sin CIF
// ---------------------------------------------------------------------------

export interface TradeCountryRankingRow {
  source_cdro: string;
  country: string;
  dimension_type: "subpartida" | "empresa";
  rank: number;
  dimension_code: string | null;
  dimension_value: string;
  year: number;
  value_fob_usd: number;
  value_cif_usd: number | null;
  pct_change: number | null;
  pct_structure: number | null;
}

interface CountryRankingShape {
  sourceCdro: string;
  dimensionType: TradeCountryRankingRow["dimension_type"];
  hasCode: boolean; // cdro_10/cdro_21 tienen código de subpartida; cdro_11/cdro_22 no
  hasCif: boolean; // cdro_21/cdro_22 (export) no tienen columna CIF
  dataStartRow: number;
}

export const COUNTRY_RANKING_SHAPES: Record<string, CountryRankingShape> = {
  cdro_10: { sourceCdro: "cdro_10", dimensionType: "subpartida", hasCode: true, hasCif: true, dataStartRow: 7 },
  cdro_11: { sourceCdro: "cdro_11", dimensionType: "empresa", hasCode: false, hasCif: true, dataStartRow: 7 },
  cdro_21: { sourceCdro: "cdro_21", dimensionType: "subpartida", hasCode: true, hasCif: false, dataStartRow: 7 },
  cdro_22: { sourceCdro: "cdro_22", dimensionType: "empresa", hasCode: false, hasCif: false, dataStartRow: 7 },
};

export const NORMALIZER_VERSION_COUNTRY_RANKING = 1;

export function normalizeCountryRanking(ws: Sheet, shape: CountryRankingShape): TradeCountryRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeCountryRankingRow[] = [];
  let currentCountry = "";

  for (let i = shape.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;
    if (col0.startsWith("Total ")) continue; // subtotal de país, no aporta estado

    const rank = parseInt(clean(row[1]), 10);
    if (!Number.isInteger(rank)) continue;
    if (col0) currentCountry = col0;
    if (!currentCountry) continue;

    let col = 2;
    const code = shape.hasCode ? clean(row[col++]) || null : null;
    const value = clean(row[col++]);
    if (!value) continue;

    const fob2024 = num(row[col + 1]);
    let cif2024: number | null = null;
    if (shape.hasCif) {
      cif2024 = num(row[col + 3]);
      col += 4;
    } else {
      col += 2;
    }
    const pctChange = row[col] != null ? num(row[col]) : null;
    const pctStructure = row[col + 1] != null ? num(row[col + 1]) : null;

    result.push({
      source_cdro: shape.sourceCdro,
      country: currentCountry,
      dimension_type: shape.dimensionType,
      rank,
      dimension_code: code,
      dimension_value: value,
      year: 2024,
      value_fob_usd: fob2024,
      value_cif_usd: cif2024,
      pct_change: pctChange,
      pct_structure: pctStructure,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// trade_summary — Fase 4: árboles de categoría de profundidad variable con
// un único valor numérico por hoja (sin FOB/CIF separados).
// ---------------------------------------------------------------------------

export interface TradeSummaryRow {
  source_cdro: string;
  category_path: string;
  item_code: string | null;
  item_label: string;
  year: number;
  value_usd: number;
  pct_change: number | null;
  pct_metric: number | null;
}

// cdro_01 — PERÚ: Intercambio Comercial. Árbol de hasta 3 niveles ([0]=
// régimen, [1]=categoría, [2]=subcategoría), sticky entre filas: cada
// columna no vacía actualiza su nivel y los niveles más superficiales se
// heredan de la fila anterior. La hoja de cada fila es la columna no vacía
// MÁS profunda (verificado en vivo 2026-10-20):
//   [0]=nivel0, [1]=nivel1, [2]=nivel2, [3]=valor2023, [4]=valor2024,
//   [5]=var_abs(descartado), [6]=var%, [7]=estructura2023(descartado), [8]=estructura2024
export function normalizeCdro01(ws: Sheet): TradeSummaryRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeSummaryRow[] = [];
  const levels: string[] = ["", "", ""];

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;

    for (let c = 0; c < 3; c++) {
      const v = clean(row[c]);
      if (v) levels[c] = v;
    }
    let leafDepth = -1;
    for (let c = 2; c >= 0; c--) {
      if (clean(row[c])) {
        leafDepth = c;
        break;
      }
    }
    if (leafDepth === -1) continue;

    const itemLabel = levels[leafDepth];
    const categoryPath = levels.slice(0, leafDepth).filter(Boolean).join(" > ") || itemLabel;
    const value2024 = num(row[4]);
    const pctChange = row[6] != null ? num(row[6]) : null;
    const pctMetric = row[8] != null ? num(row[8]) : null;

    result.push({
      source_cdro: "cdro_01",
      category_path: categoryPath,
      item_code: null,
      item_label: itemLabel,
      year: 2024,
      value_usd: value2024,
      pct_change: pctChange,
      pct_metric: pctMetric,
    });
  }

  return result;
}

// cdro_03 — PERÚ: Importación según CUODE (solo CIF, sin FOB). Misma
// mecánica de categoría-con-fila-propia que normalizeCuodeRanking (Fase 2),
// pero el ítem hoja es un código CUODE numérico plano, no un ranking:
//   categoría: [0]=label, [1..2]=null, [3]=cif2023,[4]=cif2024,[5]=var%,[6]=estructura%
//   ítem:      [0]=null, [1]=código_cuode, [2]=desc, [3..6] igual que categoría
export function normalizeCdro03(ws: Sheet): TradeSummaryRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeSummaryRow[] = [];
  let currentCategory = "";

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;

    const value2024 = num(row[4]);
    const pctChange = row[5] != null ? num(row[5]) : null;
    const pctMetric = row[6] != null ? num(row[6]) : null;

    // Fila de categoría (incluye el TOTAL general): col[1] vacío.
    if (col0 && (row[1] === null || row[1] === undefined)) {
      currentCategory = col0;
      result.push({
        source_cdro: "cdro_03",
        category_path: col0,
        item_code: null,
        item_label: col0,
        year: 2024,
        value_usd: value2024,
        pct_change: pctChange,
        pct_metric: pctMetric,
      });
      continue;
    }

    const code = clean(row[1]);
    const desc = clean(row[2]);
    if (!code || !desc || !currentCategory) continue;

    result.push({
      source_cdro: "cdro_03",
      category_path: currentCategory,
      item_code: code,
      item_label: desc,
      year: 2024,
      value_usd: value2024,
      pct_change: pctChange,
      pct_metric: pctMetric,
    });
  }

  return result;
}

// cdro_14 — PERÚ: Convenios Internacionales (solo CIF + grado de
// utilización, sin var% — reemplaza esa columna por completo). Lista
// plana, sin jerarquía: el código es numérico cuando la fila es un
// convenio real, y el propio texto ("TOTAL", "TOTAL IMPORTACIONES
// NEGOCIADAS") cuando es una fila agregada — ambos casos comparten el
// mismo layout de columnas:
//   [0]=código_o_label, [1]=desc_o_null, [2]=cif2023, [3]=cif2024,
//   [4]=utilización2023(descartado), [5]=utilización2024
export function normalizeCdro14(ws: Sheet): TradeSummaryRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeSummaryRow[] = [];

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0Raw = clean(row[0]);
    if (isFooterRow(col0Raw)) break;
    if (!col0Raw) continue;

    const code = parseInt(col0Raw, 10);
    const isNumericCode = Number.isInteger(code) && col0Raw === String(code);
    const itemLabel = isNumericCode ? clean(row[1]) : col0Raw;
    if (!itemLabel) continue;

    result.push({
      source_cdro: "cdro_14",
      category_path: itemLabel,
      item_code: isNumericCode ? col0Raw : null,
      item_label: itemLabel,
      year: 2024,
      value_usd: num(row[3]),
      pct_change: null,
      pct_metric: row[5] != null ? num(row[5]) : null,
    });
  }

  return result;
}

export const NORMALIZER_VERSION_TRADE_SUMMARY = 1;

// ---------------------------------------------------------------------------
// trade_country_bilateral (cdro_02) — PERÚ: Exportación e Importación por
// Continente, Zona Económica y País. Mismo árbol sticky de 3 niveles que
// cdro_01, pero con 3 métricas (export/import/total) en vez de 1 — y las
// filas "Total XXXX" (agregado de continente) se descartan en vez de
// persistirse, igual que el resto de "Total X" en Fases 2-3.
// Verificado en vivo 2026-10-20:
//   [0]=continente, [1]=zona económica, [2]=país,
//   [3]=exp2023,[4]=exp2024,[5]=imp2023,[6]=imp2024,[7]=tot2023,[8]=tot2024,[9]=var%,[10]=estructura%
// ---------------------------------------------------------------------------

export interface TradeCountryBilateralRow {
  continent: string;
  economic_zone: string | null;
  country: string | null;
  year: number;
  export_usd: number;
  import_usd: number;
  total_usd: number;
  pct_change: number | null;
  pct_structure: number | null;
}

export const NORMALIZER_VERSION_COUNTRY_BILATERAL = 1;

export function normalizeCdro02(ws: Sheet): TradeCountryBilateralRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: TradeCountryBilateralRow[] = [];
  const levels: string[] = ["", "", ""];

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;
    if (col0.startsWith("Total ")) continue; // agregado de continente, se descarta

    for (let c = 0; c < 3; c++) {
      const v = clean(row[c]);
      if (v) levels[c] = v;
    }
    let leafDepth = -1;
    for (let c = 2; c >= 0; c--) {
      if (clean(row[c])) {
        leafDepth = c;
        break;
      }
    }
    if (leafDepth === -1 || !levels[0]) continue;

    result.push({
      continent: levels[0],
      economic_zone: leafDepth >= 1 ? levels[1] : null,
      country: leafDepth >= 2 ? levels[2] : null,
      year: 2024,
      export_usd: num(row[4]),
      import_usd: num(row[6]),
      total_usd: num(row[8]),
      pct_change: row[9] != null ? num(row[9]) : null,
      pct_structure: row[10] != null ? num(row[10]) : null,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// customs_ops_ranking (cdro_12, cdro_13) — Fase 4: CIF + cantidad de DAMs +
// derechos e impuestos, sin FOB. cdro_12 agrupa por categoría de
// despachador (embebida en la primera fila del grupo, igual patrón que
// sector_category); cdro_13 es un ranking plano sin categoría.
// Verificado en vivo 2026-10-20:
//   cdro_12: [0]=categoría(1ra fila) o null, [1]=rank, [2]=nombre,
//            [3]=cif2023,[4]=cif2024,[5]=dams2023,[6]=dams2024,[7]=derechos2023,[8]=derechos2024
//   cdro_13: [0]=rank, [1]=nombre,
//            [2]=cif2023,[3]=cif2024,[4]=dams2023,[5]=dams2024,[6]=derechos2023,[7]=derechos2024
// ---------------------------------------------------------------------------

export interface CustomsOpsRankingRow {
  source_cdro: string;
  operator_category: string | null;
  rank: number;
  operator_name: string;
  year: number;
  value_cif_usd: number;
  dam_count: number;
  duties_usd: number;
}

export const NORMALIZER_VERSION_CUSTOMS_OPS = 1;

export function normalizeCdro12(ws: Sheet): CustomsOpsRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: CustomsOpsRankingRow[] = [];
  let currentCategory = "";

  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = clean(row[0]);
    if (isFooterRow(col0)) break;
    if (col0.startsWith("Total ")) continue;

    const rank = parseInt(clean(row[1]), 10);
    if (!Number.isInteger(rank)) continue;
    if (col0) currentCategory = col0;
    if (!currentCategory) continue;

    const name = clean(row[2]);
    if (!name) continue;

    result.push({
      source_cdro: "cdro_12",
      operator_category: currentCategory,
      rank,
      operator_name: name,
      year: 2024,
      value_cif_usd: num(row[4]),
      dam_count: Math.round(num(row[6])),
      duties_usd: num(row[8]),
    });
  }

  return result;
}

export function normalizeCdro13(ws: Sheet): CustomsOpsRankingRow[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];
  const result: CustomsOpsRankingRow[] = [];

  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rank = parseInt(clean(row[0]), 10);
    if (!Number.isInteger(rank)) break; // pie de página no numérico en col[0]

    const name = clean(row[1]);
    if (!name) continue;

    result.push({
      source_cdro: "cdro_13",
      operator_category: null,
      rank,
      operator_name: name,
      year: 2024,
      value_cif_usd: num(row[3]),
      dam_count: Math.round(num(row[5])),
      duties_usd: num(row[7]),
    });
  }

  return result;
}

export function normalizeCdro16(ws: Sheet): Cdro16Row[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];

  const result: Cdro16Row[] = [];
  let currentAduana = "";
  let currentAduanaCode = 0;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const col0 = clean(row[0]);
    const subpartida = clean(row[2]);
    const desc = clean(row[3]);

    // Skip empty
    if (!col0 && !subpartida) continue;

    // "Total XXXX" rows — inicio de grupo de aduana (col[1]=undefined, col[2]=undefined)
    if (col0.startsWith("Total ")) {
      currentAduana = col0.replace("Total ", "").trim();
      currentAduanaCode = findKnownAduanaCode(currentAduana);
      continue;
    }

    // Subpartida rows: col[2] es el código (string como "1005901100"), col[3] la descripción.
    // Total rows también pueden tener col[1]=número pero col[2]=undefined → skip.
    if (row[2] === undefined || row[2] === null) continue;
    if (!subpartida) continue;

    // [4]=FOB2023, [5]=FOB2024, [6]=CIF2023, [7]=CIF2024, [8]=var%, [9]=estructura%
    const fob2023 = num(row[4]);
    const fob2024 = num(row[5]);
    const cif2023 = num(row[6]);
    const cif2024 = num(row[7]);

    if (fob2023 === 0 && fob2024 === 0 && cif2023 === 0 && cif2024 === 0) continue;

    const aduanaName = col0.trim() || currentAduana;
    const aduanaCode = findKnownAduanaCode(aduanaName);

    result.push({
      aduana_code: aduanaCode,
      aduana_name: aduanaName,
      year: 2024,
      subpartida,
      product_desc: desc,
      value_fob_usd: fob2024,
      value_cif_usd: cif2024,
      pct_change: row[8] != null ? num(row[8]) : null,
      pct_structure: row[9] != null ? num(row[9]) : null,
    });
  }

  return result;
}
