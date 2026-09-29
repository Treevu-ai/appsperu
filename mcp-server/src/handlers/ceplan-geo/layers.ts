import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface GeoLayerRow extends NeonRow {
  id: string;
  layer_name: string;
  layer_title: string;
  workspace: string;
  service_type: string;
  geometry_type: string;
  extent_minx: number | string | null;
  extent_miny: number | string | null;
  extent_maxx: number | string | null;
  extent_maxy: number | string | null;
  feature_count: number | string;
  last_ingested_at: string;
}

interface GeoFeatureRow extends NeonRow {
  feature_id: string;
  properties: Record<string, unknown>;
  geometry_geojson: string | null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Handler para `ceplan_geo_layers` — GET /api/layers.
 *
 * Catálogo de capas WFS ingeridas desde GeoServer CEPLAN, ya persistidas en
 * PostGIS (`geo_layers`). El SQL es idéntico al de
 * `apps/ceplan-geo/api/src/routes/layers.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<GeoLayerRow>(
    `SELECT id, layer_name, layer_title, workspace, service_type, geometry_type,
            extent_minx, extent_miny, extent_maxx, extent_maxy, feature_count, last_ingested_at
     FROM geo_layers
     ORDER BY layer_name`
  );
  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        id: row.id,
        layerName: row.layer_name,
        layerTitle: row.layer_title,
        workspace: row.workspace,
        serviceType: row.service_type,
        geometryType: row.geometry_type,
        extent:
          row.extent_minx == null
            ? null
            : {
                minx: toNumberOrNull(row.extent_minx),
                miny: toNumberOrNull(row.extent_miny),
                maxx: toNumberOrNull(row.extent_maxx),
                maxy: toNumberOrNull(row.extent_maxy),
              },
        featureCount: row.feature_count,
        lastIngestedAt: row.last_ingested_at,
      })),
    },
  };
}

/** Handler para `ceplan_geo_layer_by_id` — GET /api/layers/{id}. */
export async function byId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;

  const { rows } = await db.query<GeoLayerRow>(
    `SELECT id, layer_name, layer_title, workspace, service_type, geometry_type,
            extent_minx, extent_miny, extent_maxx, extent_maxy, feature_count, last_ingested_at
     FROM geo_layers
     WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    return { status: 404, body: { error: "Capa no encontrada." } };
  }
  const row = rows[0];
  return {
    status: 200,
    body: {
      id: row.id,
      layerName: row.layer_name,
      layerTitle: row.layer_title,
      workspace: row.workspace,
      serviceType: row.service_type,
      geometryType: row.geometry_type,
      featureCount: row.feature_count,
      lastIngestedAt: row.last_ingested_at,
    },
  };
}

/**
 * Handler para `ceplan_geo_layer_features` — GET /api/layers/{id}/features.
 * PostGIS: `ST_Intersects` + `ST_MakeEnvelope` para el filtro `bbox` opcional.
 * Requiere que la extensión `postgis` esté habilitada en la base `ceplan_geo`
 * de Neon.
 */
export async function features(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;
  const bbox = args.bbox as string | undefined;
  const limit = args.limit ? Number(args.limit) : 100;

  const params: unknown[] = [id, limit];
  let bboxFilter = "";

  if (bbox) {
    const [minx, miny, maxx, maxy] = bbox.split(",").map(Number);
    params.push(minx, miny, maxx, maxy);
    bboxFilter = `AND ST_Intersects(
      gf.geometry,
      ST_MakeEnvelope($3, $4, $5, $6, 4326)
    )`;
  }

  const { rows } = await db.query<GeoFeatureRow>(
    `SELECT gf.feature_id, gf.properties, ST_AsGeoJSON(gf.geometry) AS geometry_geojson
     FROM geo_features gf
     WHERE gf.layer_id = $1
     ${bboxFilter}
     ORDER BY gf.feature_id
     LIMIT $2`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        featureId: row.feature_id,
        properties: row.properties,
        geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
      })),
    },
  };
}
