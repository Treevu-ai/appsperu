import type { Worksheet } from "exceljs";

/**
 * La hoja mezcla filas de agregado (TOTAL GENERAL, Maritimo, Fluvial, y una fila por
 * puerto/bahía) con filas de detalle (terminal con Uso Público/Privado) en la misma columna
 * "Terminales Portuarios" — ver apps/infraestructura-mtc/docs/estructura-cargas-apn-2010-2017.md.
 * No hay desagregación por tipo de carga ni dato mensual, solo un total TM por año (2010-2017).
 */

export type NivelFila = "total_general" | "ambito" | "puerto" | "terminal";
export type Ambito = "MARITIMO" | "FLUVIAL";
export type Uso = "Público" | "Privado";

export interface CargaPortuariaRow {
  nivel: NivelFila;
  ambito: Ambito | null;
  puerto: string | null;
  nombreFuente: string;
  uso: Uso | null;
  anio: number;
  volumenTm: number;
}

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

const ANIOS = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017] as const;

const COL_TERMINAL = 2;
const COL_USO = 3;
const COL_PRIMER_ANIO = 4; // Año 2010

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // Celda de fórmula: su `.result` puede venir null/undefined/"" (fórmula que evaluó a blanco) —
  // sin este chequeo, Number(null)=0 y Number(undefined)=NaN convertían silenciosamente una
  // celda vacía en un volumen "0" real en vez de null. Hallazgo real de CodeRabbit en PR #232.
  if (typeof value === "object" && "result" in (value as object)) {
    const result = (value as { result: unknown }).result;
    if (result === null || result === undefined || result === "") return null;
    const n = Number(result);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAmbitoLabel(label: string): Ambito | null {
  const upper = label.toUpperCase();
  if (upper.startsWith("MARITIMO")) return "MARITIMO";
  if (upper.startsWith("FLUVIAL")) return "FLUVIAL";
  return null;
}

function normalizeUso(label: string): Uso | null {
  if (label === "Público" || label === "Privado") return label;
  return null;
}

/**
 * Recorre la hoja desde `headerRowIndex + 1` reconstruyendo la jerarquía puerto→terminal:
 * una fila sin "Uso" abre un nuevo grupo (ámbito o puerto); las filas con "Uso" que le siguen
 * pertenecen a ese grupo hasta la siguiente fila sin "Uso".
 */
export function extractCargasRows(worksheet: Worksheet, headerRowIndex: number, lastRowIndex: number): {
  rows: CargaPortuariaRow[];
  rejected: RejectedRow[];
  filasFuenteOrigen: number;
} {
  const rows: CargaPortuariaRow[] = [];
  const rejected: RejectedRow[] = [];
  let filasFuenteOrigen = 0;

  let ambitoActual: Ambito | null = null;
  let puertoActual: string | null = null;

  for (let r = headerRowIndex + 1; r <= lastRowIndex; r += 1) {
    const row = worksheet.getRow(r);
    const nombre = cellText(row.getCell(COL_TERMINAL).value);
    if (!nombre) continue;
    if (/^Fuente:|^Elaborado por/i.test(nombre)) continue;
    filasFuenteOrigen += 1;

    const usoLabel = cellText(row.getCell(COL_USO).value);
    const uso = normalizeUso(usoLabel);

    // "TOTAL GENERAL" y los subtotales "Total IP Uso Público/Privado" son agregados nacionales
    // por tipo de uso, no puertos geográficos — no deben abrir ni cerrar un grupo de puerto.
    if (/^TOTAL\b/i.test(nombre)) {
      pushYearRows(rows, { nivel: "total_general", ambito: ambitoActual, puerto: null, nombreFuente: nombre, uso: null }, row, rejected);
      continue;
    }

    const ambitoDetectado = normalizeAmbitoLabel(nombre);
    if (ambitoDetectado) {
      ambitoActual = ambitoDetectado;
      puertoActual = null;
      pushYearRows(rows, { nivel: "ambito", ambito: ambitoActual, puerto: null, nombreFuente: nombre, uso: null }, row, rejected);
      continue;
    }

    if (uso === null) {
      // Fila de agregado por puerto/bahía dentro del ámbito actual.
      puertoActual = nombre;
      pushYearRows(rows, { nivel: "puerto", ambito: ambitoActual, puerto: null, nombreFuente: nombre, uso: null }, row, rejected);
      continue;
    }

    // Fila de detalle (terminal) — pertenece al puerto/ámbito actual.
    pushYearRows(rows, { nivel: "terminal", ambito: ambitoActual, puerto: puertoActual, nombreFuente: nombre, uso }, row, rejected);
  }

  return { rows, rejected, filasFuenteOrigen };
}

function pushYearRows(
  out: CargaPortuariaRow[],
  base: Omit<CargaPortuariaRow, "anio" | "volumenTm">,
  row: ReturnType<Worksheet["getRow"]>,
  rejected: RejectedRow[]
): void {
  ANIOS.forEach((anio, i) => {
    const raw = row.getCell(COL_PRIMER_ANIO + i).value;
    const volumen = cellNumber(raw);
    if (volumen === null) {
      rejected.push({ raw: { nombreFuente: base.nombreFuente, anio, valorOriginal: raw }, reason: `Volumen no numérico para ${base.nombreFuente} / ${anio}` });
      return;
    }
    out.push({ ...base, anio, volumenTm: volumen });
  });
}

/** Busca la fila cuya primera celda relevante contenga "Terminales Portuarios", sin asumir una
 * posición fija — el archivo ya tuvo filas de título variables en otros datasets del MTC/APN. */
export function findHeaderRow(worksheet: Worksheet, maxRowsToScan = 20): number {
  for (let r = 1; r <= maxRowsToScan; r += 1) {
    const cell = cellText(worksheet.getRow(r).getCell(COL_TERMINAL).value);
    if (cell.toUpperCase().includes("TERMINALES PORTUARIOS")) return r;
  }
  throw new Error(`No se encontró la fila de encabezado "Terminales Portuarios" en las primeras ${maxRowsToScan} filas.`);
}

/** Última fila con contenido real antes del padding vacío o del pie de fuente repetido. */
export function findLastDataRow(worksheet: Worksheet, headerRowIndex: number): number {
  let last = headerRowIndex;
  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r += 1) {
    const nombre = cellText(worksheet.getRow(r).getCell(COL_TERMINAL).value);
    if (nombre && !/^Fuente:|^Elaborado por/i.test(nombre)) last = r;
  }
  return last;
}
