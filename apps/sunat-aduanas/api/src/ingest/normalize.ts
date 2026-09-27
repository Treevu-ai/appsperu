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
//   Filas con idx numérico en col[2] = detalle de subpartida
//   cols (0-indexed):
//     [0]=aduana_name (o "Total XXX"), [1]=empty, [2]=idx_num,
//     [3]=subpartida, [4]=descripcion, [5]=fob2023, [6]=fob2024,
//     [7]=cif2023, [8]=cif2024, [9]=var_pct, [10]=estructura
// ---------------------------------------------------------------------------

export function normalizeCdro16(ws: Sheet): Cdro16Row[] {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as RawRow[];

  const result: Cdro16Row[] = [];
  let currentAduana = "";
  let currentAduanaCode = 0;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const col0 = clean(row[0]);
    const col2 = clean(row[2]);
    const subpartida = clean(row[3]);
    const desc = clean(row[4]);

    // Skip empty
    if (!col0 && !col2) continue;

    // "Total XXXX" rows — inicio de grupo de aduana (col[2]=undefined, col[3]=undefined)
    if (col0.startsWith("Total ")) {
      currentAduana = col0.replace("Total ", "").trim();
      currentAduanaCode = findKnownAduanaCode(currentAduana);
      continue;
    }

    // Subpartida rows: col[3] es la descripción (string), col[2] es el código numérico
    // Total rows también pueden tener col[2]=número pero col[3]=undefined → skip
    if (row[3] === undefined || row[3] === null) continue;

    // Código de subpartida en col[2] (string como "1005901100")
    if (!subpartida) continue;
    const idxRaw = parseInt(col2, 10);
    if (Number.isNaN(idxRaw)) continue;

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
