/**
 * Normaliza features de las 5 capas de `sernanp_visor/servicio_descarga/MapServer` (SERNANP).
 * Cada capa trae un prefijo de campo distinto (`anp_`/`zr_`/`acr_`/`acp_`) salvo Sitios
 * Prioritarios (`sp_`, schema completamente distinto) -- se normaliza cada una a un schema común
 * (nombre/código/ubicación/superficie/fechas legales), y lo que no encaja en ese común
 * (ej. `acp_titu`/`acp_tipro` de Área de Conservación Privada, `sp_pri`/`sp_cf` de Sitios
 * Prioritarios) se guarda en `atributosExtra` sin perderlo.
 */

export type Capa =
  | "anp_nacional_definitiva"
  | "zona_reservada"
  | "area_conservacion_regional"
  | "area_conservacion_privada"
  | "sitios_prioritarios";

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

interface EsriFeature {
  attributes: Record<string, unknown>;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

function toDouble(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function epochMsToDateOnly(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export interface CanonicalArea {
  capa: Capa;
  objectid: number;
  codigo: string | null;
  nombre: string | null;
  categoria: string | null;
  ubicacion: string | null;
  superficieHa: number | null;
  baseLegalEstablecimiento: string | null;
  fechaEstablecimiento: string | null;
  baseLegalModificacion: string | null;
  fechaModificacion: string | null;
  observaciones: string | null;
  atributosExtra: Record<string, unknown> | null;
}

/**
 * Mapeo de campo-fuente -> campo-común por capa. Confirmado contra el schema real de cada capa.
 *
 * `extra` debe cubrir TODOS los campos de la fuente que no van a una columna común (hallazgo real
 * de Copilot: el fixture real de ANP trae `anp_gid`/`anp_id`, pero como `extra` estaba vacío para
 * esa capa se descartaban en silencio, en contra del propio contrato documentado del conector de
 * "nada se pierde, lo que no es común va a `atributos_extra`"). `anp_gid`/`_id` confirmados
 * presentes en las 4 capas ANP/ZR/ACR/ACP (no en Sitios Prioritarios, que no los trae).
 */
const FIELD_MAP: Record<Capa, { prefix: string; extra: string[]; categoria?: string }> = {
  anp_nacional_definitiva: { prefix: "anp", extra: ["anp_gid", "anp_id"] },
  zona_reservada: { prefix: "zr", extra: ["anp_gid", "zr_id"] },
  area_conservacion_regional: { prefix: "acr", extra: ["anp_gid", "acr_id"] },
  area_conservacion_privada: {
    prefix: "acp",
    extra: ["anp_gid", "acp_id", "acp_fecad", "acp_titu", "acp_tipro", "acp_tirec", "acp_pareg"],
  },
  sitios_prioritarios: { prefix: "sp", extra: ["sp_pri", "sp_cf", "sp_ib", "sp_ci"] },
};

export interface NormalizeAreasResult {
  rows: CanonicalArea[];
  rejected: RejectedRow[];
}

export function normalizeAreas(features: EsriFeature[], capa: Capa): NormalizeAreasResult {
  const rows: CanonicalArea[] = [];
  const rejected: RejectedRow[] = [];
  const { prefix, extra } = FIELD_MAP[capa];

  for (const feature of features) {
    const attrs = feature.attributes ?? {};
    const objectid = toInt(attrs.objectid ?? attrs.OBJECTID);

    if (objectid === null) {
      rejected.push({ raw: feature, reason: "objectid ausente o inválido" });
      continue;
    }

    // Sitios Prioritarios no trae un campo de superficie legal con el mismo nombre que las
    // otras 4 capas (`anp_suleg`) -- usa `sp_sup` propio, se mapea aparte.
    const superficie = capa === "sitios_prioritarios" ? toDouble(attrs.sp_sup) : toDouble(attrs.anp_suleg);

    const atributosExtra: Record<string, unknown> = {};
    for (const key of extra) {
      if (attrs[key] !== undefined) atributosExtra[key] = attrs[key];
    }

    rows.push({
      capa,
      objectid,
      codigo: toText(attrs[`${prefix}_codi`] ?? attrs[`${prefix}_cod`]),
      nombre: toText(attrs[`${prefix}_nomb`]),
      categoria: capa === "anp_nacional_definitiva" ? toText(attrs.anp_cate) : null,
      ubicacion: toText(attrs[`${prefix}_ubpo`]),
      superficieHa: superficie,
      baseLegalEstablecimiento: toText(attrs[`${prefix}_balec`]),
      fechaEstablecimiento: epochMsToDateOnly(attrs[`${prefix}_felec`]),
      baseLegalModificacion: toText(attrs[`${prefix}_balem`]),
      fechaModificacion: epochMsToDateOnly(attrs[`${prefix}_felem`]),
      observaciones: toText(attrs[`${prefix}_obs`]),
      atributosExtra: Object.keys(atributosExtra).length > 0 ? atributosExtra : null,
    });
  }

  return { rows, rejected };
}
