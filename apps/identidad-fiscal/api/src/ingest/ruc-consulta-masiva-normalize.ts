/**
 * Parser del .txt delimitado por "|" que descarga la "Consulta Múltiple de
 * RUC" de SUNAT (e-consultaruc.sunat.gob.pe/cl-ti-itmrconsmulruc/jrmS00Alias).
 * Columnas confirmadas en vivo el 2026-09-18 contra 2 RUC reales (ACOPAGRO,
 * Chancamayo) vía ingreso manual — esa variante llega en Latin-1. La
 * variante de archivo (hasta 100 RUC por carga), confirmada en vivo el
 * 2026-09-19 con los mismos 2 RUC, llega en **UTF-8** — encoding distinto
 * según la variante usada. Este parser recibe el texto ya decodificado por
 * el import script; no asume un encoding específico él mismo.
 */

const COL = {
  RUC: 0,
  RAZON_SOCIAL: 1,
  TIPO_CONTRIBUYENTE: 2,
  PROFESION_OFICIO: 3,
  NOMBRE_COMERCIAL: 4,
  CONDICION_CONTRIBUYENTE: 5,
  ESTADO_CONTRIBUYENTE: 6,
  FECHA_INSCRIPCION: 7,
  FECHA_INICIO_ACTIVIDADES: 8,
  DEPARTAMENTO: 9,
  PROVINCIA: 10,
  DISTRITO: 11,
  DIRECCION: 12,
  TELEFONO: 13,
  FAX: 14,
  ACTIVIDAD_COMERCIO_EXTERIOR: 15,
  CIIU_PRINCIPAL: 16,
  CIIU_SECUNDARIO_1: 17,
  CIIU_SECUNDARIO_2: 18,
  AFECTO_NUEVO_RUS: 19,
  BUEN_CONTRIBUYENTE: 20,
  AGENTE_RETENCION: 21,
  AGENTE_PERCEPCION_VENTA_INTERNA: 22,
  AGENTE_PERCEPCION_COMBUSTIBLE: 23,
} as const;

const MIN_COLUMNS = 24;
const HEADER_PREFIX = "NumeroRuc|";

export interface NormalizedRucMasivo {
  ruc: string;
  razonSocial: string;
  tipoContribuyente: string | null;
  profesionOficio: string | null;
  nombreComercial: string | null;
  condicionContribuyente: string | null;
  estadoContribuyente: string | null;
  fechaInscripcion: string | null;
  fechaInicioActividades: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  telefono: string | null;
  fax: string | null;
  actividadComercioExterior: string | null;
  ciiuPrincipal: string | null;
  ciiuSecundario1: string | null;
  ciiuSecundario2: string | null;
  afectoNuevoRus: string | null;
  buenContribuyente: string | null;
  agenteRetencion: string | null;
  agentePercepcionVentaInterna: string | null;
  agentePercepcionCombustible: string | null;
}

export interface RejectedRow {
  raw: string[];
  reason: string;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

function parseFechaDDMMYYYY(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  // Valida que sea una fecha calendario real (ej. rechaza 31/02/2024) — Date
  // normaliza silenciosamente días fuera de rango en vez de lanzar, así que
  // se verifica con un round-trip contra los componentes originales.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** `line` es una fila ya separada por "|" del .txt (previamente decodificado — ver nota de encoding arriba). */
export function normalizeRucMasivoRow(fields: string[]): NormalizedRucMasivo | RejectedRow {
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
    tipoContribuyente: emptyToNull(fields[COL.TIPO_CONTRIBUYENTE]),
    profesionOficio: emptyToNull(fields[COL.PROFESION_OFICIO]),
    nombreComercial: emptyToNull(fields[COL.NOMBRE_COMERCIAL]),
    condicionContribuyente: emptyToNull(fields[COL.CONDICION_CONTRIBUYENTE]),
    estadoContribuyente: emptyToNull(fields[COL.ESTADO_CONTRIBUYENTE]),
    fechaInscripcion: parseFechaDDMMYYYY(fields[COL.FECHA_INSCRIPCION]),
    fechaInicioActividades: parseFechaDDMMYYYY(fields[COL.FECHA_INICIO_ACTIVIDADES]),
    departamento: emptyToNull(fields[COL.DEPARTAMENTO]),
    provincia: emptyToNull(fields[COL.PROVINCIA]),
    distrito: emptyToNull(fields[COL.DISTRITO]),
    direccion: emptyToNull(fields[COL.DIRECCION]),
    telefono: emptyToNull(fields[COL.TELEFONO]),
    fax: emptyToNull(fields[COL.FAX]),
    actividadComercioExterior: emptyToNull(fields[COL.ACTIVIDAD_COMERCIO_EXTERIOR]),
    ciiuPrincipal: emptyToNull(fields[COL.CIIU_PRINCIPAL]),
    ciiuSecundario1: emptyToNull(fields[COL.CIIU_SECUNDARIO_1]),
    ciiuSecundario2: emptyToNull(fields[COL.CIIU_SECUNDARIO_2]),
    afectoNuevoRus: emptyToNull(fields[COL.AFECTO_NUEVO_RUS]),
    buenContribuyente: emptyToNull(fields[COL.BUEN_CONTRIBUYENTE]),
    agenteRetencion: emptyToNull(fields[COL.AGENTE_RETENCION]),
    agentePercepcionVentaInterna: emptyToNull(fields[COL.AGENTE_PERCEPCION_VENTA_INTERNA]),
    agentePercepcionCombustible: emptyToNull(fields[COL.AGENTE_PERCEPCION_COMBUSTIBLE]),
  };
}

export function isRejected(row: NormalizedRucMasivo | RejectedRow): row is RejectedRow {
  return "reason" in row;
}

/** Parsea el archivo .txt completo (ya leído como string decodificado), saltando el encabezado. */
export function parseRucMasivoFile(text: string): (NormalizedRucMasivo | RejectedRow)[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const dataLines = lines[0]?.startsWith(HEADER_PREFIX) ? lines.slice(1) : lines;
  return dataLines.map((line) => normalizeRucMasivoRow(line.split("|")));
}
