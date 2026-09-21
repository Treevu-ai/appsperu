/**
 * Normaliza features de `SERV_CATASTRO_MINERO/MapServer/0/query` (INGEMMET).
 *
 * TIT_CONCES (titular) puede ser persona natural en minería artesanal/pequeña -- se trata como
 * dato público de un registro de derecho minero, no se enmascara (mismo criterio que un registro
 * de propiedad SUNARP), pero se documenta explícitamente (ver la migración 001_init.sql).
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

interface EsriAttributes {
  OBJECTID?: unknown;
  CODIGOU?: unknown;
  FEC_DENU?: unknown;
  CONCESION?: unknown;
  TIT_CONCES?: unknown;
  HECTAGIS?: unknown;
  ESTADO?: unknown;
  D_ESTADO?: unknown;
  SUSTANCIA?: unknown;
  DEPA?: unknown;
  PROVI?: unknown;
  DISTRI?: unknown;
  FECHA_ACTUALIZACION?: unknown;
}

export interface EsriFeature {
  attributes: EsriAttributes;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function toDouble(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/** Campos de fecha de ArcGIS llegan como epoch milliseconds (esriFieldTypeDate), no texto ISO. */
function epochMsToIsoDateTime(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export interface CanonicalDerecho {
  objectid: number;
  codigou: string;
  fechaDenuncio: string | null;
  concesion: string | null;
  titular: string | null;
  hectareas: number | null;
  estado: string | null;
  estadoDescripcion: string | null;
  sustancia: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  fechaActualizacion: string | null;
}

export interface NormalizeDerechosResult {
  rows: CanonicalDerecho[];
  rejected: RejectedRow[];
}

export function normalizeDerechos(features: EsriFeature[]): NormalizeDerechosResult {
  const rows: CanonicalDerecho[] = [];
  const rejected: RejectedRow[] = [];

  for (const feature of features) {
    const attrs = feature.attributes ?? {};
    const objectid = toInt(attrs.OBJECTID);
    const codigou = toText(attrs.CODIGOU);

    if (objectid === null) {
      rejected.push({ raw: feature, reason: "OBJECTID ausente o inválido" });
      continue;
    }
    if (!codigou) {
      rejected.push({ raw: feature, reason: "CODIGOU ausente" });
      continue;
    }

    const fechaDenuncioIso = epochMsToIsoDateTime(attrs.FEC_DENU);
    const fechaActualizacionIso = epochMsToIsoDateTime(attrs.FECHA_ACTUALIZACION);

    rows.push({
      objectid,
      codigou,
      fechaDenuncio: fechaDenuncioIso ? fechaDenuncioIso.slice(0, 10) : null,
      concesion: toText(attrs.CONCESION),
      titular: toText(attrs.TIT_CONCES),
      hectareas: toDouble(attrs.HECTAGIS),
      estado: toText(attrs.ESTADO),
      estadoDescripcion: toText(attrs.D_ESTADO),
      sustancia: toText(attrs.SUSTANCIA),
      departamento: toText(attrs.DEPA),
      provincia: toText(attrs.PROVI),
      distrito: toText(attrs.DISTRI),
      fechaActualizacion: fechaActualizacionIso,
    });
  }

  return { rows, rejected };
}
