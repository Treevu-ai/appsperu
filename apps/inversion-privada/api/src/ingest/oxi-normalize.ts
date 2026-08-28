/**
 * Columnas B→Q confirmadas en vivo el 2026-08-28 sobre el XLSX real de
 * `investmentpromotionExport.php` (fila de cabecera real en r="10", no la
 * primera fila del sheet — hay filas de título/metadata antes).
 */
export const OXI_COLUMNS = {
  id: "B", // "N°"
  fase: "C",
  tipoInversion: "D",
  nivelEstudio: "E",
  nivelGobierno: "F",
  departamento: "G",
  provincia: "H",
  distrito: "I",
  entidad: "J",
  linkWeb: "K",
  codigoReferencia: "L", // "CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA" — mezcla 3 sistemas de código
  nombreProyecto: "M",
  funcion: "N",
  tipologia: "O",
  montoInversionReferencial: "P",
  rangoMonto: "Q",
} as const;

export type OxiRawRow = Partial<Record<string, string>>;

export interface NormalizedOxiRow {
  oxiId: number;
  fase: string | null;
  tipoInversion: string | null;
  nivelEstudio: string | null;
  nivelGobierno: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  entidad: string | null;
  codigoReferencia: string | null;
  nombreProyecto: string;
  funcion: string | null;
  tipologia: string | null;
  montoInversionReferencial: number | null;
  rangoMonto: string | null;
}

/**
 * Convierte `"S/443,431.09"` (o variantes con espacios) a `443431.09`.
 * Los montos OxI vienen en soles — moneda distinta a `montoInversionSigv`
 * (dólares) de la cartera APP/PA VERTIX; no se deben sumar entre sí.
 */
export function parseOxiMontoSoles(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/S\/\.?/gi, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Normaliza una fila cruda (columna → texto de celda). Devuelve `null` para
 * filas que no son datos reales (título, metadata "Nº Registros: NNN", fila
 * vacía final) — todas identificables porque no traen un `N°` numérico en
 * la columna B.
 */
export function parseOxiRow(cells: OxiRawRow): NormalizedOxiRow | null {
  const idRaw = cells[OXI_COLUMNS.id]?.trim();
  if (!idRaw || !/^\d+$/.test(idRaw)) return null;

  const nombreProyecto = cells[OXI_COLUMNS.nombreProyecto]?.trim();
  if (!nombreProyecto) return null;

  return {
    oxiId: Number(idRaw),
    fase: trimOrNull(cells[OXI_COLUMNS.fase]),
    tipoInversion: trimOrNull(cells[OXI_COLUMNS.tipoInversion]),
    nivelEstudio: trimOrNull(cells[OXI_COLUMNS.nivelEstudio]),
    nivelGobierno: trimOrNull(cells[OXI_COLUMNS.nivelGobierno]),
    departamento: trimOrNull(cells[OXI_COLUMNS.departamento]),
    provincia: trimOrNull(cells[OXI_COLUMNS.provincia]),
    distrito: trimOrNull(cells[OXI_COLUMNS.distrito]),
    entidad: trimOrNull(cells[OXI_COLUMNS.entidad]),
    codigoReferencia: trimOrNull(cells[OXI_COLUMNS.codigoReferencia]),
    nombreProyecto,
    funcion: trimOrNull(cells[OXI_COLUMNS.funcion]),
    tipologia: trimOrNull(cells[OXI_COLUMNS.tipologia]),
    montoInversionReferencial: parseOxiMontoSoles(cells[OXI_COLUMNS.montoInversionReferencial]),
    rangoMonto: trimOrNull(cells[OXI_COLUMNS.rangoMonto]),
  };
}
