import type { Worksheet } from "exceljs";

export interface YearLink {
  year: number;
  url: string;
}

/**
 * La página de listado de MTPE (www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/)
 * enlaza una publicación de gob.pe por año, con el año siempre presente en
 * la URL pero con un slug ligeramente distinto entre años
 * (`indicadores-laborales-a-nivel-de-distrito-2020`,
 * `indicadores-a-nivel-de-distrito-2023`, etc.) — no hay un patrón de slug
 * único, así que se extrae el año de la URL misma, no del slug completo.
 */
export function extractYearLinksFromListing(html: string): YearLink[] {
  const regex = /href="(https:\/\/www\.gob\.pe\/institucion\/mtpe\/informes-publicaciones\/[^"]*?(20\d{2})[^"]*)"/g;
  const results: YearLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    results.push({ url: match[1], year: Number(match[2]) });
  }
  return results;
}

export function pickLatestYearLink(links: YearLink[]): YearLink {
  if (links.length === 0) {
    throw new Error("No se encontró ningún enlace a una publicación anual en la página de listado de MTPE.");
  }
  return links.reduce((latest, current) => (current.year > latest.year ? current : latest));
}

/**
 * La publicación de cada año (gob.pe/institucion/mtpe/informes-publicaciones/...)
 * enlaza el archivo real alojado en cdn.www.gob.pe, comprimido en `.7z`
 * (no hay versión sin comprimir). Confirmado en vivo para 2025.
 */
export function extract7zUrlFromLandingPage(html: string): string | null {
  const match = html.match(/href="(https:\/\/cdn\.www\.gob\.pe\/uploads\/document\/file\/[^"]+\.7z[^"]*)"/);
  return match ? match[1] : null;
}

/** "EMPRESAS_25" para 2025 — confirmado en vivo contra el archivo real. */
export function sheetNameForYear(year: number): string {
  return `EMPRESAS_${String(year).slice(-2)}`;
}

export interface DistritoRow {
  ubigeo: string;
  distrito: string | null;
  valoresPorMes: Array<number | null>; // longitud 12, índice 0 = enero
}

const MONTH_HEADERS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
  }
  return String(value).trim();
}

/**
 * El header no está en una fila fija (puede variar el número de filas de
 * título entre años) — se busca la fila cuya primera celda mencione
 * "UBIGEO", en vez de asumir una posición fija. Confirmado en vivo: fila 7
 * en el archivo de 2025.
 */
export function findHeaderRow(worksheet: Worksheet, maxRowsToScan = 20): number {
  for (let r = 1; r <= maxRowsToScan; r += 1) {
    const cell = cellText(worksheet.getRow(r).getCell(1).value).toUpperCase();
    if (cell.includes("UBIGEO")) return r;
  }
  throw new Error(`No se encontró una fila de encabezado con "UBIGEO" en las primeras ${maxRowsToScan} filas.`);
}

/** Confirma que la hoja realmente corresponde al año esperado, buscando
 * "AÑO {year}" en las primeras filas — no se asume solo por el nombre de
 * la hoja o de la URL. */
export function confirmSheetYear(worksheet: Worksheet, expectedYear: number, maxRowsToScan = 10): boolean {
  for (let r = 1; r <= maxRowsToScan; r += 1) {
    const cell = cellText(worksheet.getRow(r).getCell(1).value).toUpperCase();
    if (cell.includes(String(expectedYear))) return true;
  }
  return false;
}

/**
 * Extrae las filas de distrito de la hoja, resolviendo las columnas de mes
 * por nombre de encabezado (no por posición fija) — más robusto ante un
 * reordenamiento de columnas entre años.
 */
export function extractDistritoRows(worksheet: Worksheet, headerRowIndex: number): DistritoRow[] {
  const headerRow = worksheet.getRow(headerRowIndex);
  const monthColumnIndex: number[] = MONTH_HEADERS.map((month) => {
    let col = -1;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cellText(cell.value).toUpperCase() === month) col = colNumber;
    });
    return col;
  });

  const missingMonths = MONTH_HEADERS.filter((_, i) => monthColumnIndex[i] === -1);
  if (missingMonths.length > 0) {
    throw new Error(`No se encontraron las columnas de mes esperadas en el encabezado: ${missingMonths.join(", ")}`);
  }

  const ubigeoColIndex = 1;
  let distritoColIndex = -1;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (cellText(cell.value).toUpperCase().includes("DISTRITO")) distritoColIndex = colNumber;
  });

  const rows: DistritoRow[] = [];
  const lastRow = worksheet.rowCount;
  for (let r = headerRowIndex + 1; r <= lastRow; r += 1) {
    const row = worksheet.getRow(r);
    const ubigeo = cellText(row.getCell(ubigeoColIndex).value).trim();
    if (!ubigeo || !/^\d+$/.test(ubigeo)) continue; // fin de la tabla o fila de totales/notas

    const distrito = distritoColIndex > 0 ? cellText(row.getCell(distritoColIndex).value) || null : null;
    const valoresPorMes = monthColumnIndex.map((colIdx) => {
      const raw = row.getCell(colIdx).value;
      if (raw === null || raw === undefined || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    });

    rows.push({ ubigeo: ubigeo.padStart(6, "0"), distrito, valoresPorMes });
  }

  return rows;
}
