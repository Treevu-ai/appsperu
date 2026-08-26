import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { toNumberOrNull } from "../lib/format.js";

export const layersRouter = Router();

const FeaturesQuerySchema = z.object({
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "formato: minx,miny,maxx,maxy")
    .optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

layersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, layer_name, layer_title, workspace, service_type, geometry_type,
              extent_minx, extent_miny, extent_maxx, extent_maxy, feature_count, last_ingested_at
       FROM geo_layers
       ORDER BY layer_name`
    );
    res.json({
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
    });
  })
);

layersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, layer_name, layer_title, workspace, service_type, geometry_type,
              extent_minx, extent_miny, extent_maxx, extent_maxy, feature_count, last_ingested_at
       FROM geo_layers
       WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Capa no encontrada." });
      return;
    }
    const row = rows[0];
    res.json({
      id: row.id,
      layerName: row.layer_name,
      layerTitle: row.layer_title,
      workspace: row.workspace,
      serviceType: row.service_type,
      geometryType: row.geometry_type,
      featureCount: row.feature_count,
      lastIngestedAt: row.last_ingested_at,
    });
  })
);

layersRouter.get(
  "/:id/features",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(FeaturesQuerySchema, req.query, res);
    if (!parsed) return;

    const limit = parsed.limit ?? 100;
    const params: unknown[] = [req.params.id, limit];
    let bboxFilter = "";

    if (parsed.bbox) {
      const [minx, miny, maxx, maxy] = parsed.bbox.split(",").map(Number);
      params.push(minx, miny, maxx, maxy);
      bboxFilter = `AND ST_Intersects(
        gf.geometry,
        ST_MakeEnvelope($3, $4, $5, $6, 4326)
      )`;
    }

    const { rows } = await pool.query(
      `SELECT gf.feature_id, gf.properties, ST_AsGeoJSON(gf.geometry) AS geometry_geojson
       FROM geo_features gf
       WHERE gf.layer_id = $1
       ${bboxFilter}
       ORDER BY gf.feature_id
       LIMIT $2`,
      params
    );

    res.json({
      resultados: rows.map((row) => ({
        featureId: row.feature_id,
        properties: row.properties,
        geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
      })),
    });
  })
);
