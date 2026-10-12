import { pool } from "../db/pool.js";
import type { GeoJSONPolygon } from "./gfw-client.js";

export interface PreFiltroGeobosques {
  /** ¿Hay algún polígono de Geobosques (de cualquier clase) tocando esta geometría? Si no, la zona está fuera de nuestra carga parcial (47%) y Geobosques no puede opinar. */
  cubierto: boolean;
  /** ¿Alguno de esos polígonos es de clase "Pérdida..."? */
  intersectaPerdida: boolean;
}

/**
 * Pre-filtro barato (SQL local, sin límite de tasa) antes de gastar cuota de
 * la API de GFW. `perdida_bosque_poligono` solo cubre el 47% del país (ver
 * project_rastro_perdida_bosque_parcial en memoria) — por eso `cubierto`
 * importa: si la zona no está cargada, Geobosques no tiene nada que decir
 * (ni a favor ni en contra) y hay que consultar GFW igual, no asumir que
 * "sin pérdida en Geobosques" significa "sin pérdida" cuando en realidad es
 * "sin dato".
 */
export async function preFiltroGeobosques(geometry: GeoJSONPolygon): Promise<PreFiltroGeobosques> {
  const { rows } = await pool.query<{ cubierto: boolean; intersecta_perdida: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM perdida_bosque_poligono
         WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
       ) AS cubierto,
       EXISTS (
         SELECT 1 FROM perdida_bosque_poligono
         WHERE cobertura LIKE 'Pérdida%'
           AND ST_Intersects(geom, ST_GeomFromGeoJSON($1))
       ) AS intersecta_perdida`,
    [JSON.stringify(geometry)]
  );
  return { cubierto: rows[0].cubierto, intersectaPerdida: rows[0].intersecta_perdida };
}
