export type Capa =
  | "predio_rural"
  | "predio_matriz"
  | "capa_2"
  | "capa_3"
  | "capa_4"
  | "comunidades_campesinas"
  | "comunidades_nativas"
  | "capa_7"
  | "proyectos_catastrales"
  | "mosaico_predios_rurales";

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

export interface CanonicalPredio {
  capa: Capa;
  objectid: number | null;
  area_ha: number | null;
  perimetro: number | null;
  id_dist: string | null;
  cod_proy: string | null;
  nom_dpto: string | null;
  nom_prov: string | null;
  nom_dist: string | null;
  nombre: string | null;
  estado: string | null;
  fuente: string | null;
  tipo_proceso: string | null;
  nro_titulo: string | null;
  anio_titulo: string | null;
  geometry_rings: unknown;
  atributos_extra: Record<string, unknown> | null;
}

export interface NormalizeMidagriResult {
  rows: CanonicalPredio[];
  rejected: RejectedRow[];
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toDouble(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export const LAYER_NAMES: Record<number, Capa> = {
  0: "predio_rural",
  1: "predio_matriz",
  2: "capa_2",
  3: "capa_3",
  4: "capa_4",
  5: "comunidades_campesinas",
  6: "comunidades_nativas",
  7: "capa_7",
  8: "proyectos_catastrales",
  9: "mosaico_predios_rurales",
};

const COMMON_FIELDS = new Set([
  "OBJECTID",
  "objectid",
  "AREA_HA",
  "area_ha",
  "PERIMETRO",
  "perimetro",
  "ID_DIST",
  "id_dist",
  "COD_PROY",
  "cod_proy",
  "NOM_DPTO",
  "nom_dpto",
  "NOM_PROV",
  "nom_prov",
  "NOM_DIST",
  "nom_dist",
  "NOMBRE",
  "nombre",
  "ESTADO",
  "estado",
  "FUENTE",
  "fuente",
  "TIPO_PROCESO",
  "tipo_proceso",
  "NRO_TITULO",
  "nro_titulo",
  "ANIO_TITULO",
  "anio_titulo",
  "SHAPE",
  "shape",
  "geometry",
]);

export function normalizeMidagri(features: readonly unknown[], layerId: number): NormalizeMidagriResult {
  const rows: CanonicalPredio[] = [];
  const rejected: RejectedRow[] = [];
  const capa = LAYER_NAMES[layerId] ?? `capa_${layerId}`;

  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) {
      rejected.push({ raw: feature, reason: "La feature no es un objeto." });
      continue;
    }
    const maybeAttrs = (feature as { attributes?: unknown }).attributes;
    if (typeof maybeAttrs !== "object" || maybeAttrs === null) {
      rejected.push({ raw: feature, reason: "La feature no tiene 'attributes' (objeto) válido." });
      continue;
    }
    const attrs = maybeAttrs as Record<string, unknown>;

    const objectid = toInt(attrs.OBJECTID ?? attrs.objectid);

    const atributos_extra: Record<string, unknown> = {};
    for (const key of Object.keys(attrs)) {
      if (!COMMON_FIELDS.has(key)) {
        atributos_extra[key] = attrs[key];
      }
    }

    // BUG REAL encontrado en vivo (2026-10-14): la geometría de ArcGIS NO
    // viene dentro de `attributes` -- viene como campo HERMANO de
    // `attributes` en la feature (`{ attributes: {...}, geometry: { rings:
    // [...] } }`). Buscarla en `attrs.SHAPE/shape/geometry` siempre daba
    // null porque esos campos nunca existen ahí -- confirmado: 0 de 3.37M
    // filas en las 10 capas tenían geometría pese a que la ingesta
    // reportaba éxito completo. La geometría real se lee de
    // `feature.geometry.rings`, no de `attributes`.
    const maybeGeometry = (feature as { geometry?: unknown }).geometry;
    const geometry_rings =
      maybeGeometry && typeof maybeGeometry === "object" && "rings" in (maybeGeometry as Record<string, unknown>)
        ? ((maybeGeometry as { rings?: unknown }).rings ?? null)
        : null;

    rows.push({
      capa,
      objectid,
      area_ha: toDouble(attrs.AREA_HA ?? attrs.area_ha),
      perimetro: toDouble(attrs.PERIMETRO ?? attrs.perimetro),
      id_dist: toText(attrs.ID_DIST ?? attrs.id_dist),
      cod_proy: toText(attrs.COD_PROY ?? attrs.cod_proy),
      nom_dpto: toText(attrs.NOM_DPTO ?? attrs.nom_dpto),
      nom_prov: toText(attrs.NOM_PROV ?? attrs.nom_prov),
      nom_dist: toText(attrs.NOM_DIST ?? attrs.nom_dist),
      nombre: toText(attrs.NOMBRE ?? attrs.nombre),
      estado: toText(attrs.ESTADO ?? attrs.estado),
      fuente: toText(attrs.FUENTE ?? attrs.fuente),
      tipo_proceso: toText(attrs.TIPO_PROCESO ?? attrs.tipo_proceso),
      nro_titulo: toText(attrs.NRO_TITULO ?? attrs.nro_titulo),
      anio_titulo: toText(attrs.ANIO_TITULO ?? attrs.anio_titulo),
      geometry_rings,
      atributos_extra: Object.keys(atributos_extra).length > 0 ? atributos_extra : null,
    });
  }

  return { rows, rejected };
}