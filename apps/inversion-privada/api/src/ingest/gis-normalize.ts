/**
 * Esquema confirmado en vivo el 2026-08-28 sobre
 * `https://vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas` — GeoJSON
 * FeatureCollection sin auth, cargado por el dashboard público embebido en
 * `https://www.investinperu.pe/gis-vertix/`.
 */
export interface GisRawFeature {
  type: string;
  geometry: string; // GeoJSON geometry serializado como string, hay que parsearlo
  properties: {
    IDPROYECTO?: number | null;
    NOMBREPROYECTO?: string | null;
    SECTOR?: string | null;
    FASE?: string | null;
    TIPOPROYECTO?: string | null;
    IDDEPARTAMENTO?: string | null; // "13", "13,06,14" (multi-región) o null (ámbito nacional)
    CODIGO?: string | null;
    TIPOCOORDENADANOMBRE?: string | null;
  };
}

export interface GisFeatureCollection {
  type: string;
  features: GisRawFeature[];
}

export interface NormalizedGisFeature {
  codigo: string;
  idProyecto: number | null;
  nombreProyecto: string | null;
  sector: string | null;
  fase: string | null;
  tipoProyecto: string | null;
  departamentosInei: string[];
  tipoCoordenada: string | null;
  geometry: Record<string, unknown>;
}

/**
 * `IDDEPARTAMENTO` puede venir como código simple ("13"), lista separada por
 * comas para proyectos multi-región ("13,06,14"), o `null`/vacío para
 * proyectos de ámbito nacional (sin departamento asociado).
 */
export function parseIdDepartamento(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Devuelve `null` cuando la fila no trae `CODIGO` (clave primaria de la
 * tabla) o cuando `geometry` no es un JSON válido — ambas condiciones ya
 * vistas en la investigación de features reales.
 */
export function parseGisFeature(feature: GisRawFeature): NormalizedGisFeature | null {
  const codigo = trimOrNull(feature.properties?.CODIGO);
  if (!codigo) return null;

  let geometry: Record<string, unknown>;
  try {
    const parsed = JSON.parse(feature.geometry);
    if (!parsed || typeof parsed !== "object") return null;
    geometry = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  return {
    codigo,
    idProyecto: typeof feature.properties?.IDPROYECTO === "number" ? feature.properties.IDPROYECTO : null,
    nombreProyecto: trimOrNull(feature.properties?.NOMBREPROYECTO),
    sector: trimOrNull(feature.properties?.SECTOR),
    fase: trimOrNull(feature.properties?.FASE),
    tipoProyecto: trimOrNull(feature.properties?.TIPOPROYECTO),
    departamentosInei: parseIdDepartamento(feature.properties?.IDDEPARTAMENTO),
    tipoCoordenada: trimOrNull(feature.properties?.TIPOCOORDENADANOMBRE),
    geometry,
  };
}
