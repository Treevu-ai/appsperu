/**
 * Cliente mínimo para la GFW Data API (Global Forest Watch), dataset
 * `umd_tree_cover_loss` (Hansen/GLAD, University of Maryland) — la única
 * fuente con la que confirmamos precisión de pérdida de bosque POR AÑO.
 * Geobosques (MINAM) solo trae "Pérdida 2001-2024" como clase agregada,
 * sin año — insuficiente para el corte EUDR (2020-12-31).
 *
 * Requiere `GFW_API_KEY`, generada a mano por el usuario (login propio en
 * globalforestwatch.org) — nunca se crea ni se maneja la contraseña de la
 * cuenta desde acá, solo la API key ya emitida.
 */

const GFW_BASE_URL = "https://data-api.globalforestwatch.org";

function apiKey(): string {
  const key = process.env.GFW_API_KEY;
  if (!key) throw new Error("GFW_API_KEY no está definida. Copia .env.example a .env.");
  return key;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey(),
    // El geostore que generamos la API key quedó con domains=["localhost"];
    // GFW valida el header Origin contra esa lista.
    Origin: "http://localhost",
  };
}

export interface GeoJSONPolygon {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

interface GeostoreResponse {
  data: { gfw_geostore_id: string; gfw_area__ha: number };
  status: string;
}

/** Registra una geometría en GFW y devuelve el geostore_id para consultarla. */
export async function createGeostore(geometry: GeoJSONPolygon): Promise<{ geostoreId: string; areaHa: number }> {
  const res = await fetch(`${GFW_BASE_URL}/geostore/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ geometry }),
  });
  if (!res.ok) throw new Error(`GFW geostore falló (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as GeostoreResponse;
  return { geostoreId: body.data.gfw_geostore_id, areaHa: body.data.gfw_area__ha };
}

export interface PerdidaPorAnio {
  anio: number;
  areaHa: number;
}

interface QueryJsonResponse {
  data: Array<{ umd_tree_cover_loss__year: number; area_ha: number }>;
  status: string;
}

/** Pérdida de cobertura forestal por año (Hansen/GLAD) dentro de un geostore. */
export async function queryTreeCoverLossByYear(geostoreId: string): Promise<PerdidaPorAnio[]> {
  const sql =
    "SELECT umd_tree_cover_loss__year, SUM(area__ha) as area_ha FROM data GROUP BY umd_tree_cover_loss__year ORDER BY umd_tree_cover_loss__year";
  const url = new URL(`${GFW_BASE_URL}/dataset/umd_tree_cover_loss/latest/query/json`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("geostore_id", geostoreId);

  const res = await fetch(url, { headers: headers(), redirect: "follow" });
  if (!res.ok) throw new Error(`GFW query falló (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as QueryJsonResponse;
  return body.data.map((r) => ({ anio: r.umd_tree_cover_loss__year, areaHa: r.area_ha }));
}

const CORTE_EUDR_ANIO = 2020;

export interface ResultadoEudr {
  geostoreId: string | null;
  areaHaConsultada: number | null;
  serieAnual: PerdidaPorAnio[];
  perdidaPostCorteHa: number;
  cumpleCorteEudr: boolean;
  /** "geobosques" = resuelto gratis con el pre-filtro local, sin gastar cuota de GFW; "gfw" = se consultó GFW. */
  resueltoCon: "geobosques" | "gfw";
}

/**
 * Due diligence EUDR para una geometría de parcela: crea el geostore, saca
 * la serie anual de pérdida, y separa lo que cae antes/después del corte
 * del art. 9(1)(d) del Reglamento (UE) 2023/1115 (2020-12-31).
 *
 * Antes de gastar cuota de GFW (de tasa limitada), usa `preFiltro` —
 * calculado aparte con `preFiltroGeobosques` — para resolver gratis los
 * casos donde Geobosques ya cubre la zona y no hay ninguna clase "Pérdida"
 * ahí: no hace falta precisión de año porque no hay pérdida que fechar.
 * Si la zona no está cubierta por Geobosques, o si sí hay pérdida (y hace
 * falta el año exacto para el corte), se consulta GFW igual.
 */
export async function evaluarCorteEudr(
  geometry: GeoJSONPolygon,
  preFiltro: { cubierto: boolean; intersectaPerdida: boolean }
): Promise<ResultadoEudr> {
  if (preFiltro.cubierto && !preFiltro.intersectaPerdida) {
    return {
      geostoreId: null,
      areaHaConsultada: null,
      serieAnual: [],
      perdidaPostCorteHa: 0,
      cumpleCorteEudr: true,
      resueltoCon: "geobosques",
    };
  }

  const { geostoreId, areaHa } = await createGeostore(geometry);
  const serieAnual = await queryTreeCoverLossByYear(geostoreId);
  const perdidaPostCorteHa = serieAnual
    .filter((r) => r.anio > CORTE_EUDR_ANIO)
    .reduce((sum, r) => sum + r.areaHa, 0);

  return {
    geostoreId,
    areaHaConsultada: areaHa,
    serieAnual,
    perdidaPostCorteHa,
    cumpleCorteEudr: perdidaPostCorteHa === 0,
    resueltoCon: "gfw",
  };
}
