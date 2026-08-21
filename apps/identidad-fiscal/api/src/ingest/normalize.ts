/**
 * Columnas reales del Padrón Reducido RUC, en orden (confirmado en vivo el
 * 2026-08-20, ver docs/data-contracts/sunat-padron-ruc.md):
 *
 *   RUC|NOMBRE O RAZÓN SOCIAL|ESTADO DEL CONTRIBUYENTE|CONDICIÓN DE DOMICILIO|
 *   UBIGEO|TIPO DE VÍA|NOMBRE DE VÍA|CÓDIGO DE ZONA|TIPO DE ZONA|NÚMERO|
 *   INTERIOR|LOTE|DEPARTAMENTO|MANZANA|KILÓMETRO
 *
 * Solo se conservan las columnas que sostienen los hallazgos validados
 * (estatus tributario + ubigeo + dirección básica) — INTERIOR/LOTE/
 * DEPARTAMENTO/MANZANA/KILÓMETRO se descartan a propósito: en la muestra
 * real vienen vacías ("-") en la enorme mayoría de filas, incluso para
 * personas jurídicas con UBIGEO poblado.
 */
const COL = {
  RUC: 0,
  RAZON_SOCIAL: 1,
  ESTADO: 2,
  CONDICION_DOMICILIO: 3,
  UBIGEO: 4,
  TIPO_VIA: 5,
  NOMBRE_VIA: 6,
  NUMERO: 9,
} as const;

const MIN_COLUMNS = 10;

export interface NormalizedContribuyente {
  ruc: string;
  razonSocial: string;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
  ubigeo: string | null;
  tipoVia: string | null;
  nombreVia: string | null;
  numero: string | null;
}

export interface RejectedRow {
  raw: string[];
  reason: string;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

/**
 * Valida y normaliza una fila ya separada por "|". No decodifica encoding
 * (eso lo hace el connector antes de partir la línea) y no filtra por
 * prefijo de RUC (eso también lo hace el connector, antes de llamar acá) —
 * esta función solo garantiza que la fila tiene forma válida.
 */
export function normalizeContribuyenteRow(fields: string[]): NormalizedContribuyente | RejectedRow {
  if (fields.length < MIN_COLUMNS) {
    return { raw: fields, reason: `fila con ${fields.length} columnas, se esperaban al menos ${MIN_COLUMNS}` };
  }

  const ruc = (fields[COL.RUC] ?? "").trim();
  if (!/^\d{11}$/.test(ruc)) {
    return { raw: fields, reason: `RUC inválido: "${ruc}" (se espera 11 dígitos)` };
  }

  const razonSocial = (fields[COL.RAZON_SOCIAL] ?? "").trim();
  if (razonSocial === "") {
    return { raw: fields, reason: "razón social vacía" };
  }

  return {
    ruc,
    razonSocial,
    estadoContribuyente: emptyToNull(fields[COL.ESTADO]),
    condicionDomicilio: emptyToNull(fields[COL.CONDICION_DOMICILIO]),
    ubigeo: emptyToNull(fields[COL.UBIGEO]),
    tipoVia: emptyToNull(fields[COL.TIPO_VIA]),
    nombreVia: emptyToNull(fields[COL.NOMBRE_VIA]),
    numero: emptyToNull(fields[COL.NUMERO]),
  };
}

export function isRejected(row: NormalizedContribuyente | RejectedRow): row is RejectedRow {
  return "reason" in row;
}
