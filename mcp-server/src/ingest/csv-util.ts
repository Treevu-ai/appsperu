/**
 * Utilidades CSV compartidas por los conectores de Agromercado (datosabiertos.gob.pe).
 *
 * A diferencia del parser de `agromercado-articulacion.ts` (quote-aware pero por LÍNEA,
 * válido porque esa fuente no trae saltos de línea dentro de comillas), el dataset de
 * Asistencias Técnicas (A0005) sí trae campos de texto libre con saltos de línea reales
 * dentro de comillas (ej. descripciones multi-párrafo en `nombre_AT`). Un split por
 * `\r?\n` antes de parsear comillas rompe esas filas a la mitad, así que este parser
 * recorre el texto completo carácter por carácter y solo corta filas en un `\n` que no
 * está dentro de comillas.
 */

/** Parser CSV completo (no por línea), quote-aware, tolerante a saltos de línea dentro de comillas. */
export function parseDelimitedCsv(text: string, delimiter = ";"): string[][] {
  const sinBom = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  const n = sinBom.length;

  while (i < n) {
    const c = sinBom[i];
    if (inQuotes) {
      if (c === '"') {
        if (sinBom[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // descarta líneas en blanco finales (fila de un solo campo vacío)
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

export function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const t = v.trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function toStrOrNull(v: string | undefined): string | null {
  const t = v?.trim();
  if (!t || t.length === 0 || t === "-") return null;
  return t;
}

/**
 * Convierte fechas `d/m/yyyy` o `d/m/yyyy hh:mm` (formato real de los datasets de
 * Agromercado) a `yyyy-mm-dd`. Devuelve null si el formato no matchea en vez de
 * lanzar — una fecha rara no debe tumbar la ingesta completa de ~10k filas.
 */
export function parseDmyDate(v: string | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
