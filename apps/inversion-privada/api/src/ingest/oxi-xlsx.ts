import * as XLSX from "xlsx";

export interface OxiSpreadsheetRow {
  oxiId: number;
  faseOxi: string | null;
  tipoInversion: string | null;
  ultimoNivelEstudio: string | null;
  nivelGobierno: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  entidad: string | null;
  codigoSnip: string | null;
  nombre: string;
  funcion: string | null;
  tipologia: string | null;
  montoReferencial: string | null;
  rangoMonto: string | null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseOxiId(value: unknown): number | null {
  const text = cellText(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseMontoSoles(value: string | null): number | null {
  if (!value) return null;
  const normalized = value
    .replace(/^S\/\s*/i, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function rowLooksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toUpperCase();
  return joined.includes("NOMBRE DEL PROYECTO") && joined.includes("DEPARTAMENTO");
}

function mapDataRow(cells: string[]): OxiSpreadsheetRow | null {
  const oxiId = parseOxiId(cells[1]);
  if (!oxiId) return null;

  const nombre = cellText(cells[12]);
  if (!nombre) return null;

  const montoReferencial = cellText(cells[15]) || null;

  return {
    oxiId,
    faseOxi: cellText(cells[2]) || null,
    tipoInversion: cellText(cells[3]) || null,
    ultimoNivelEstudio: cellText(cells[4]) || null,
    nivelGobierno: cellText(cells[5]) || null,
    departamento: cellText(cells[6]) || null,
    provincia: cellText(cells[7]) || null,
    distrito: cellText(cells[8]) || null,
    entidad: cellText(cells[9]) || null,
    codigoSnip: cellText(cells[11]) || null,
    nombre,
    funcion: cellText(cells[13]) || null,
    tipologia: cellText(cells[14]) || null,
    montoReferencial,
    rangoMonto: cellText(cells[16]) || null,
  };
}

export function parseOxiWorkbook(buffer: Buffer): OxiSpreadsheetRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });

  let headerIndex = -1;
  for (let i = 0; i < matrix.length; i += 1) {
    const cells = (matrix[i] ?? []).map((cell) => cellText(cell));
    if (rowLooksLikeHeader(cells)) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error("No se encontró la fila de encabezados en el XLSX OxI.");
  }

  const rows: OxiSpreadsheetRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const cells = (matrix[i] ?? []).map((cell) => cellText(cell));
    const row = mapDataRow(cells);
    if (row) rows.push(row);
  }

  return rows;
}
