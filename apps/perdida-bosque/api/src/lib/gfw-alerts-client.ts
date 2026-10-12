/**
 * Alertas de deforestación casi en tiempo real (semanales), a diferencia de
 * `umd_tree_cover_loss` (Hansen/UMD, anual, con 1-2 años de retraso). Dos
 * fuentes complementarias de GFW:
 * - RADD (`wur_radd_alerts`): radar Sentinel-1, penetra nubes, cobertura
 *   pantropical.
 * - GLAD-DIST (`umd_glad_dist_alerts`): óptico Sentinel-2/Landsat, mayor
 *   resolución espacial, cobertura casi global.
 *
 * Campos verificados en vivo contra la GFW Data API (2026-10-12) — ambos
 * datasets devuelven la fecha como string "YYYY-MM-DD" y la confianza ya
 * resuelta a texto ("nominal"|"high"|"highest") en las respuestas de
 * `/query/json`, aunque en `/fields` aparezcan como códigos numéricos.
 */

import { createGeostore, type GeoJSONPolygon } from "./gfw-client.js";

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
    Origin: "http://localhost",
  };
}

export type FuenteAlerta = "radd" | "glad_dist";

export interface AlertaReciente {
  fuente: FuenteAlerta;
  fecha: string;
  areaHa: number;
  confianza: string;
}

interface AlertaDatasetConfig {
  fuente: FuenteAlerta;
  dataset: string;
  campoFecha: string;
  campoConfianza: string;
}

const DATASETS: AlertaDatasetConfig[] = [
  { fuente: "radd", dataset: "wur_radd_alerts", campoFecha: "wur_radd_alerts__date", campoConfianza: "wur_radd_alerts__confidence" },
  { fuente: "glad_dist", dataset: "umd_glad_dist_alerts", campoFecha: "umd_glad_dist_alerts__date", campoConfianza: "umd_glad_dist_alerts__confidence" },
];

async function consultarDataset(geostoreId: string, desdeFecha: string, config: AlertaDatasetConfig): Promise<AlertaReciente[]> {
  const sql =
    `SELECT ${config.campoFecha}, ${config.campoConfianza}, SUM(area__ha) AS area_ha FROM data ` +
    `WHERE ${config.campoFecha} >= '${desdeFecha}' ` +
    `GROUP BY ${config.campoFecha}, ${config.campoConfianza} ORDER BY ${config.campoFecha} DESC`;

  const url = new URL(`${GFW_BASE_URL}/dataset/${config.dataset}/latest/query/json`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("geostore_id", geostoreId);

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`GFW query falló (${res.status}) para ${config.dataset}: ${await res.text()}`);

  const body = (await res.json()) as { data: Array<Record<string, unknown>> };
  return body.data.map((row) => ({
    fuente: config.fuente,
    fecha: String(row[config.campoFecha]),
    areaHa: Number(row.area_ha),
    confianza: String(row[config.campoConfianza]),
  }));
}

/**
 * Consulta RADD y GLAD-DIST para una geometría desde una fecha dada.
 * Crea un geostore nuevo en GFW para la geometría (no reutiliza uno
 * existente) — para evaluaciones repetidas sobre la misma parcela, el
 * caller puede cachear el geostoreId devuelto por `createGeostore`.
 */
export async function consultarAlertasRecientes(geometry: GeoJSONPolygon, desdeFecha: string): Promise<AlertaReciente[]> {
  const { geostoreId } = await createGeostore(geometry);
  const resultados = await Promise.all(DATASETS.map((config) => consultarDataset(geostoreId, desdeFecha, config)));
  return resultados.flat().sort((a, b) => b.fecha.localeCompare(a.fecha));
}
