import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { consultarAlertasRecientes } from "../lib/gfw-alerts-client.js";
import type { GeoJSONPolygon } from "../lib/gfw-client.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const alertasRecientesRouter = Router();

const QuerySchema = z.object({
  codigou: z.string().min(1, "codigou es requerido"),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "desde debe tener formato YYYY-MM-DD")
    .optional(),
});

/**
 * Alertas casi en tiempo real (RADD + GLAD-DIST, semanales) para una
 * concesión minera por su código INGEMMET (`codigou` en `mining_rights`).
 * Complementa `umd_tree_cover_loss` (anual, con retraso) — ver
 * `gfw-alerts-client.ts` para el detalle de ambas fuentes.
 */
alertasRecientesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;

    const { rows } = await pool.query<{ codigou: string; titular: string; geom_json: string }>(
      `SELECT codigou, titular, ST_AsGeoJSON(geom) AS geom_json FROM mining_rights WHERE codigou = $1`,
      [parsed.codigou]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: `No se encontró la concesión ${parsed.codigou} en mining_rights.` });
      return;
    }

    const desdeFecha = parsed.desde ?? "2026-01-01";
    const geometry = JSON.parse(rows[0].geom_json) as GeoJSONPolygon;
    const alertas = await consultarAlertasRecientes(geometry, desdeFecha);
    const totalHa = alertas.reduce((sum, a) => sum + a.areaHa, 0);

    res.json({
      codigou: rows[0].codigou,
      titular: rows[0].titular,
      desde: desdeFecha,
      totalAlertas: alertas.length,
      totalHa,
      alertas,
      fuentes: {
        radd: "wur_radd_alerts (radar Sentinel-1, GFW Data API)",
        glad_dist: "umd_glad_dist_alerts (óptico Sentinel-2/Landsat, GFW Data API)",
      },
    });
  })
);
