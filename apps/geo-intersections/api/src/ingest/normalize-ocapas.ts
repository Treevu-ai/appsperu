/**
 * normalize-ocapas.ts — Normaliza features de SERFOR OCAPAS_MIDAGRI.
 *
 * Convierte features de ArcGIS REST a formato canónico para la tabla rural_communities.
 * Maneja geometría rings[] → GeoJSON MultiPolygon, cierra anillos, y extrae campos específicos.
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
  geometry: string; // GeoJSON MultiPolygon
  atributos_extra: Record<string, unknown> | null;
}

export interface RejectedRow {
  raw: ArcGISFeature;
  reason: string;
}

function isValidRing(ring: unknown): ring is number[][] {
  return (
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.every(
      (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number"
    )
  );
}

/** Área con signo (fórmula del "shoelace"). El signo (no la magnitud) es lo que importa aquí. */
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum / 2;
}

interface Shell {
  exterior: number[][];
  holes: number[][][];
}

/**
 * Agrupa rings de ArcGIS en shells (exterior + holes) siguiendo la convención
 * de orientación de Esri: un anillo clockwise abre un shell exterior nuevo;
 * un anillo counter-clockwise es un hole del shell exterior más reciente.
 *
 * Confirmado en vivo contra datos reales (2026-10-06): 212/4,492 features
 * (comunidades_campesinas + comunidades_nativas) tienen más de un ring, y NO
 * todos son holes — ej. OBJECTID 7 "PUERTO ANGEL" (comunidades_campesinas)
 * tiene 2 rings, AMBOS clockwise (dos shells exteriores disjuntos, no un
 * hole). La v1 de este normalizador trataba ring[1+] siempre como hole —
 * con esa feature real, el segundo polígono se habría leído como agujero
 * del primero, corrompiendo la geometría consultada directamente por
 * `/intersect`.
 */
function groupRingsIntoShells(rings: number[][][]): Shell[] {
  const shells: Shell[] = [];
  for (const ring of rings) {
    const isExterior = shells.length === 0 || signedArea(ring) > 0;
    if (isExterior) {
      shells.push({ exterior: ring, holes: [] });
    } else {
      shells[shells.length - 1].holes.push(ring);
    }
  }
  return shells;
}

/** Convierte shells agrupados a GeoJSON MultiPolygon (siempre, incluso con un solo shell, por consistencia de tipo en la columna de PostGIS). */
function shellsToGeoJSON(shells: readonly Shell[]): string {
  return JSON.stringify({
    type: "MultiPolygon",
    coordinates: shells.map((s) => [s.exterior, ...s.holes]),
  });
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

    // Rechazar features con algún ring malformado (no array, <3 puntos, o puntos no numéricos) —
    // sin esto, un ring inválido llega a ST_GeomFromGeoJSON y hace fallar/rollback todo el batch.
    if (!f.geometry.rings.every(isValidRing)) {
      rejected.push({ raw: f, reason: "geometry.rings contiene un anillo inválido" });
      continue;
    }

    // Cerrar anillos si no están cerrados
    const rings = f.geometry.rings.map((ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, [...first]];
      }
      return ring;
    });

    // Agrupar en shells (exterior + holes) y convertir a GeoJSON MultiPolygon
    const shells = groupRingsIntoShells(rings);
    const geojson = shellsToGeoJSON(shells);

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
