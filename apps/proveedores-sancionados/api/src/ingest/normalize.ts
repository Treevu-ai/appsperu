/**
 * Columnas reales confirmadas en vivo el 2026-08-20 (ver
 * docs/data-contracts/proveedores-sancionados.md) — el reporte trae DOS
 * secciones con distinto número de columnas dentro del mismo archivo:
 *
 * Inhabilitaciones (11 cols): # | Razon Social | RUC | Resolución |
 *   Periodo de Inhabilitación | Desde | Hasta | Infracción | Otra Infracción
 *   | Norma | Estado
 *
 * Multas (14 cols): # | Razon Social | RUC | Resolución | Fecha de
 *   Resolución | Monto de Multa (Soles) | Infracción | Periodo de
 *   Suspensión(medida cautelar) | Desde | Hasta | Otra Infracción | Norma |
 *   Verificación de pago | Estado
 */

const INHABILITACION_COLS = 11;
const MULTA_COLS = 14;

export interface NormalizedInhabilitacion {
  ruc: string;
  razonSocial: string;
  resolucion: string;
  periodoInhabilitacion: string | null;
  desde: string | null; // YYYY-MM-DD
  hasta: string | null;
  infraccion: string | null;
  otraInfraccion: string | null;
  norma: string | null;
  estado: string | null;
}

export interface NormalizedMulta {
  ruc: string;
  razonSocial: string;
  resolucion: string;
  fechaResolucion: string | null;
  montoMulta: number | null;
  infraccion: string | null;
  periodoSuspension: string | null;
  desde: string | null;
  hasta: string | null;
  otraInfraccion: string | null;
  norma: string | null;
  verificacionPago: string | null;
  estado: string | null;
}

export interface RejectedRow {
  raw: string[];
  reason: string;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Fechas reales vienen como D/M/YYYY o DD/MM/YYYY (un solo dígito posible en día/mes). */
function parseFecha(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseMonto(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const num = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

const RUC_COL_INHABILITACION = 2;
const RUC_COL_MULTA = 2;

/** Distingue una fila de encabezado (repetida cada vez que cambia de sección/página) de una fila de datos real. */
export function isHeaderRow(cells: string[]): boolean {
  return cells.some((c) => /^Razon Social$/i.test(c.trim())) || cells.some((c) => /^RUC$/i.test(c.trim()));
}

/** Marca el inicio de la sección de inhabilitaciones (fila con el título del bloque). */
export function isInhabilitacionSectionMarker(cells: string[]): boolean {
  return cells.some((c) => /periodo de inhabilitaci/i.test(c));
}

/** Marca el inicio de la sección de multas. */
export function isMultaSectionMarker(cells: string[]): boolean {
  return cells.some((c) => /monto de multa/i.test(c));
}

export function normalizeInhabilitacionRow(cells: string[]): NormalizedInhabilitacion | RejectedRow {
  if (cells.length < INHABILITACION_COLS) {
    return { raw: cells, reason: `fila con ${cells.length} columnas, se esperaban ${INHABILITACION_COLS}` };
  }
  const ruc = (cells[RUC_COL_INHABILITACION] ?? "").trim();
  if (!/^\d{8,11}$/.test(ruc)) {
    return { raw: cells, reason: `RUC inválido en columna ${RUC_COL_INHABILITACION}: "${ruc}"` };
  }
  const razonSocial = (cells[1] ?? "").trim();
  if (razonSocial === "") {
    return { raw: cells, reason: "razón social vacía" };
  }
  const resolucion = (cells[3] ?? "").trim();
  if (resolucion === "") {
    return { raw: cells, reason: "resolución vacía" };
  }

  return {
    ruc,
    razonSocial,
    resolucion,
    periodoInhabilitacion: emptyToNull(cells[4]),
    desde: parseFecha(cells[5]),
    hasta: parseFecha(cells[6]),
    infraccion: emptyToNull(cells[7]),
    otraInfraccion: emptyToNull(cells[8]),
    norma: emptyToNull(cells[9]),
    estado: emptyToNull(cells[10]),
  };
}

export function normalizeMultaRow(cells: string[]): NormalizedMulta | RejectedRow {
  if (cells.length < MULTA_COLS) {
    return { raw: cells, reason: `fila con ${cells.length} columnas, se esperaban ${MULTA_COLS}` };
  }
  const ruc = (cells[RUC_COL_MULTA] ?? "").trim();
  if (!/^\d{8,11}$/.test(ruc)) {
    return { raw: cells, reason: `RUC inválido en columna ${RUC_COL_MULTA}: "${ruc}"` };
  }
  const razonSocial = (cells[1] ?? "").trim();
  if (razonSocial === "") {
    return { raw: cells, reason: "razón social vacía" };
  }
  const resolucion = (cells[3] ?? "").trim();
  if (resolucion === "") {
    return { raw: cells, reason: "resolución vacía" };
  }

  return {
    ruc,
    razonSocial,
    resolucion,
    fechaResolucion: parseFecha(cells[4]),
    montoMulta: parseMonto(cells[5]),
    infraccion: emptyToNull(cells[6]),
    periodoSuspension: emptyToNull(cells[7]),
    desde: parseFecha(cells[8]),
    hasta: parseFecha(cells[9]),
    otraInfraccion: emptyToNull(cells[10]),
    norma: emptyToNull(cells[11]),
    verificacionPago: emptyToNull(cells[12]),
    estado: emptyToNull(cells[13]),
  };
}

export function isRejected<T>(row: T | RejectedRow): row is RejectedRow {
  return typeof row === "object" && row !== null && "reason" in row;
}
