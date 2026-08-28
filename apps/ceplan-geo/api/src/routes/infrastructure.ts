import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { findNearbyInfrastructure } from "../crossref/nearby-infrastructure.js";
import { INFRA_TYPE_VALUES } from "../ingest/layers.js";

export const infrastructureRouter = Router();

const InfrastructureQuerySchema = z.object({
  type: z.enum(INFRA_TYPE_VALUES).optional(),
  departamento: z
    .string()
    .regex(/^\d{2}$/, "departamento debe ser código INEI de 2 dígitos (ej. 13 para La Libertad)")
    .optional(),
});

const NearQuerySchema = z.object({
  ubigeo: z.string().regex(/^\d{6}$/),
  radius_km: z.coerce.number().min(0.1).max(500).optional(),
  type: z.enum(INFRA_TYPE_VALUES).optional(),
});

infrastructureRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(InfrastructureQuerySchema, req.query, res);
    if (!parsed) return;

    const params: unknown[] = [];
    const conditions: string[] = [];
    if (parsed.type) {
      params.push(parsed.type);
      conditions.push(`infra_type = $${params.length}`);
    }
    if (parsed.departamento) {
      params.push(parsed.departamento);
      conditions.push(`properties->>'iddpto' = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT infra_type, name, properties, ST_AsGeoJSON(geometry) AS geometry_geojson
       FROM infrastructure
       ${where}
       ORDER BY name
       LIMIT 1000`,
      params
    );

    res.json({
      resultados: rows.map((row) => ({
        infraType: row.infra_type,
        name: row.name,
        properties: row.properties,
        geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
      })),
    });
  })
);

infrastructureRouter.get(
  "/near",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(NearQuerySchema, req.query, res);
    if (!parsed) return;

    const nearby = await findNearbyInfrastructure(
      parsed.ubigeo,
      parsed.radius_km ?? 50,
      parsed.type
    );

    res.json({
      ubigeo: parsed.ubigeo,
      radiusKm: parsed.radius_km ?? 50,
      resultados: nearby,
      restriccion: "Proximidad calculada al centroide del distrito; no implica accesibilidad real.",
    });
  })
);
