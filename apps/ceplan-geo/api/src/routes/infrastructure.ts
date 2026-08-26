import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { findNearbyInfrastructure } from "../crossref/nearby-infrastructure.js";

export const infrastructureRouter = Router();

const InfrastructureQuerySchema = z.object({
  type: z.enum(["aeropuerto", "puerto"]).optional(),
});

const NearQuerySchema = z.object({
  ubigeo: z.string().regex(/^\d{6}$/),
  radius_km: z.coerce.number().min(0.1).max(500).optional(),
  type: z.enum(["aeropuerto", "puerto"]).optional(),
});

infrastructureRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(InfrastructureQuerySchema, req.query, res);
    if (!parsed) return;

    const params: unknown[] = [];
    let where = "";
    if (parsed.type) {
      params.push(parsed.type);
      where = "WHERE infra_type = $1";
    }

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
