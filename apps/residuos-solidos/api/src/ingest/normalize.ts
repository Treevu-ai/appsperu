/**
 * Normaliza filas de "Generación anual de residuos sólidos domiciliarios y municipales"
 * (MINAM/SIGERSOL). La fuente pierde el cero inicial de UBIGEO para departamentos 01-09 (mismo
 * problema ya documentado en SIDPOL/seguridad-ciudadana) y usa fecha de corte en formato
 * DDMMAAAA (no AAAAMMDD como RUIAS/PVD) — confirmado porque los primeros 4 dígitos de un valor
 * real ("18122025") no forman un año válido.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDecimal(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizeUbigeo(value: unknown): string | null {
  const text = toText(value);
  if (!text || !/^\d{1,6}$/.test(text)) return null;
  return text.padStart(6, "0");
}

function isValidCalendarDate(yyyy: string, mm: string, dd: string): boolean {
  const y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Fuente real: FECHA_CORTE de 8 dígitos, pero el ORDEN no es consistente entre filas —
 * confirmado en vivo 2026-09-06: algunas filas traen DDMMAAAA (ej. "18122025"), otras AAAAMMDD
 * (ej. "20240410", que interpretado ingenuamente como DDMMAAAA da un mes 24 inválido y Postgres
 * lo rechaza). Se prueban ambas lecturas y se usa la que produce una fecha de calendario real
 * (valida mes 1-12 y día 1-31 con round-trip, no solo el rango) — un chequeo ingenuo de "¿el año
 * está en rango?" no basta: una fecha DDMMAAAA como "20122025" (20 dic 2025) tiene los primeros
 * 4 dígitos "2012", que también cae en rango de año válido.
 */
function toDateFromAmbiguous8Digits(value: unknown): string | null {
  const text = toText(value);
  if (!text || !/^\d{8}$/.test(text)) return null;

  const yyyyFirst = { yyyy: text.slice(0, 4), mm: text.slice(4, 6), dd: text.slice(6, 8) };
  if (isValidCalendarDate(yyyyFirst.yyyy, yyyyFirst.mm, yyyyFirst.dd)) {
    return `${yyyyFirst.yyyy}-${yyyyFirst.mm}-${yyyyFirst.dd}`;
  }

  const ddFirst = { dd: text.slice(0, 2), mm: text.slice(2, 4), yyyy: text.slice(4, 8) };
  if (isValidCalendarDate(ddFirst.yyyy, ddFirst.mm, ddFirst.dd)) {
    return `${ddFirst.yyyy}-${ddFirst.mm}-${ddFirst.dd}`;
  }

  return null;
}

export interface CanonicalResiduos {
  ubigeo: string;
  anio: number;
  departamento: string;
  provincia: string;
  distrito: string;
  regionNatural: string | null;
  tipoMunicipalidad: string | null;
  poblacionTotal: number | null;
  poblacionUrbana: number | null;
  poblacionRural: number | null;
  clasificacionMunicipalMef: string | null;
  generacionPercapitaDom: number | null;
  generacionDomUrbanaTdia: number | null;
  generacionDomUrbanaTanio: number | null;
  generacionMunTanio: number | null;
  generacionMunTdia: number | null;
  generacionPercapitaMun: number | null;
  fechaCorte: string | null;
}

export interface NormalizeResiduosResult {
  rows: CanonicalResiduos[];
  rejected: RejectedRow[];
}

export function normalizeResiduos(rawRows: Record<string, unknown>[]): NormalizeResiduosResult {
  const rows: CanonicalResiduos[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const ubigeo = normalizeUbigeo(raw["UBIGEO"]);
    const anio = toInt(raw["ANIO"]);
    const departamento = toText(raw["DEPARTAMENTO"]);
    const provincia = toText(raw["PROVINCIA"]);
    const distrito = toText(raw["DISTRITO"]);

    if (!ubigeo) {
      rejected.push({ raw, reason: "UBIGEO ausente o inválido" });
      continue;
    }
    if (anio === null) {
      rejected.push({ raw, reason: "ANIO ausente o no numérico" });
      continue;
    }
    if (!departamento || !provincia || !distrito) {
      rejected.push({ raw, reason: "DEPARTAMENTO/PROVINCIA/DISTRITO ausente" });
      continue;
    }

    rows.push({
      ubigeo,
      anio,
      departamento,
      provincia,
      distrito,
      regionNatural: toText(raw["REGION_NATURAL"]),
      tipoMunicipalidad: toText(raw["TIPO_MUNICIPALIDAD"]),
      poblacionTotal: toInt(raw["POB_TOTAL_INEI"]),
      poblacionUrbana: toInt(raw["POB_URBANA_INEI"]),
      poblacionRural: toInt(raw["POB_RURAL_INEI"]),
      clasificacionMunicipalMef: toText(raw["CLASIFICACION_MUNICIPAL_MEF"]),
      generacionPercapitaDom: toDecimal(raw["GENERACION_PER_CAPITA_DOM"]),
      generacionDomUrbanaTdia: toDecimal(raw["GENERACION_DOM_URBANA_TDIA"]),
      generacionDomUrbanaTanio: toDecimal(raw["GENERACION_DOM URBANA_TANIO"]),
      generacionMunTanio: toDecimal(raw["GENERACION_MUN_TANIO"]),
      generacionMunTdia: toDecimal(raw["GENERACION_MUN_TDIA"]),
      generacionPercapitaMun: toDecimal(raw["GENERACION_PER_CAPITA_MUNICIPAL"]),
      fechaCorte: toDateFromAmbiguous8Digits(raw["FECHA_CORTE"]),
    });
  }

  return { rows, rejected };
}
