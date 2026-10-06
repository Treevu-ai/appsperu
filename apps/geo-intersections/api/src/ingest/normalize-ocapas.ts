/**
 * normalize-ocapas.ts — Normaliza features de SERFOR OCAPAS_MIDAGRI.
 *
 * Convierte features de ArcGIS REST a formato canónico para la tabla rural_communities.
 * Maneja geometría rings[] → GeoJSON Polygon, cierra anillos, y extrae campos específicos.
 *
 * Schema de campos confirmado contra la API en vivo (2026-10-06), capas 26 y 27:
 *   nomcom, painre, ofinre, depar, provi, distr, ubidis (código UBIGEO distrital),
 *   OBJECTID, gml_id, feinre, Aarea (hectáreas), centroide_e/n, accion, fecha_carga
 *   — comunes a ambas capas.
 *   comunidades_nativas (27) además trae: prodem, restit, titcom, codigo, fereti, fectit.
 *   comunidades_campesinas (26) además trae: OBJECTID_WFS, prodes.
 * Ninguna capa expone ZUTM/COORX/COORY/PERIME/TITULO/NOMPRE/AREA — esos nombres
 * pertenecen a otra capa (predios por departamento, IDs 1-25), no a comunidades.
 */

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry: { rings: number[][][] };
}

export interface CanonicalCommunity {
  capa: string;
  objectid: number;
  nombre: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  area_ha: number | null;
  perimetro: number | null;
  titulo: string | null;
  zona_utm: number | null;
  coordenada_x: number | null;
  coordenada_y: number | null;
  geometry: string; // GeoJSON Polygon
  atributos_extra: Record<string, unknown> | null;
}

export interface RejectedRow {
  raw: ArcGISFeature;
  reason: string;
}

/**
 * Convierte un polygon rings[] de ArcGIS a GeoJSON Polygon.
 * rings[0] = exterior ring; rings[1+] = holes (interiores, si existen).
 */
function ringsToGeoJSON(rings: number[][][]): string {
  const coords = rings.map((ring) =>
    ring.map(([x, y]) => [x, y] as [number, number])
  );
  return JSON.stringify({ type: "Polygon", coordinates: coords });
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Campos ya mapeados explícitamente abajo — el resto va a atributos_extra.
const FIXED_KEYS = new Set([
  "OBJECTID", "nomcom", "depar", "provi", "distr", "Aarea",
  "centroide_e", "centroide_n", "titcom",
  "SHAPE.STArea()", "SHAPE.STLength()", "Shape",
]);

export function normalizeOcapasFeatures(
  features: readonly ArcGISFeature[],
  capa: string
): { rows: CanonicalCommunity[]; rejected: RejectedRow[] } {
  const rows: CanonicalCommunity[] = [];
  const rejected: RejectedRow[] = [];

  for (const f of features) {
    const a = f.attributes;

    // Validar campos obligatorios
    const objectid = a.OBJECTID as number | null;
    if (objectid == null) {
      rejected.push({ raw: f, reason: "OBJECTID ausente" });
      continue;
    }

    // Validar geometría
    if (!f.geometry?.rings || !Array.isArray(f.geometry.rings) || f.geometry.rings.length === 0) {
      rejected.push({ raw: f, reason: "geometry.rings ausente o vacío" });
      continue;
    }

    // Cerrar anillos si no están cerrados
    const rings = f.geometry.rings.map((ring) => {
      if (ring.length < 3) return ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, [...first]];
      }
      return ring;
    });

    // Convertir a GeoJSON
    const geojson = ringsToGeoJSON(rings);

    const atributosExtra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) {
      if (!FIXED_KEYS.has(k)) atributosExtra[k] = v;
    }

    rows.push({
      capa,
      objectid,
      nombre: trimOrNull(a.nomcom),
      departamento: trimOrNull(a.depar),
      provincia: trimOrNull(a.provi),
      distrito: trimOrNull(a.distr),
      area_ha: typeof a.Aarea === "number" ? a.Aarea : null,
      // SHAPE.STLength() viene en grados (no en metros) y la fuente no expone
      // un campo de perímetro utilizable; se calcula con ST_Perimeter en consultas si se necesita.
      perimetro: null,
      // titcom (título comunal) solo existe en comunidades_nativas (capa 27).
      titulo: trimOrNull(a.titcom),
      // La fuente no expone zona UTM para estas capas.
      zona_utm: null,
      coordenada_x: typeof a.centroide_e === "number" ? a.centroide_e : null,
      coordenada_y: typeof a.centroide_n === "number" ? a.centroide_n : null,
      geometry: geojson,
      atributos_extra: Object.keys(atributosExtra).length > 0 ? atributosExtra : null,
    });
  }

  return { rows, rejected };
}
