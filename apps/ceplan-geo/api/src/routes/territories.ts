import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { territoryFromRow } from "../lib/format.js";
import { getTerritoryByUbigeo, lookupTerritoryByNames } from "../crossref/territory-lookup.js";
import { getDepartmentTerritorySummary } from "../lib/territory-summary.js";
import { isPilotDepartment } from "../lib/pilot-departments.js";

export const territoriesRouter = Router();

const TerritoryQuerySchema = z.object({
  ubigeo: z.string().regex(/^\d{6}$/).optional(),
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
});

const BboxQuerySchema = z.object({
  minx: z.coerce.number(),
  miny: z.coerce.number(),
  maxx: z.coerce.number(),
  maxy: z.coerce.number(),
});

territoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TerritoryQuerySchema, req.query, res);
    if (!parsed) return;

    if (parsed.ubigeo) {
      const territory = await getTerritoryByUbigeo(parsed.ubigeo);
      if (!territory) {
        res.status(404).json({ error: "Territorio no encontrado." });
        return;
      }
      res.json(territoryFromRow({
        ...territory,
        geometry_geojson: territory.geometryGeojson,
      }));
      return;
    }

    if (!parsed.departamento) {
      res.status(400).json({ error: "Indique ubigeo o departamento." });
      return;
    }

    const { territory, matchStatus } = await lookupTerritoryByNames(
      parsed.departamento,
      parsed.provincia,
      parsed.distrito
    );

    if (!territory) {
      res.status(404).json({ error: "Territorio no encontrado.", matchStatus });
      return;
    }

    res.json({
      ...territoryFromRow({ ...territory, geometry_geojson: territory.geometryGeojson }),
      matchStatus,
    });
  })
);

const SummaryQuerySchema = z.object({
  departamento: z.string().min(1),
});

territoriesRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SummaryQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase().trim();
    if (!isPilotDepartment(departamento)) {
      res.status(400).json({
        error: "Departamento fuera del piloto ALSOL Fase 2.",
        departamentosPermitidos: ["LA LIBERTAD", "LAMBAYEQUE", "PIURA", "CAJAMARCA", "CUSCO"],
      });
      return;
    }

    const summary = await getDepartmentTerritorySummary(departamento);
    if (!summary) {
      res.status(404).json({ error: "Resumen territorial no encontrado." });
      return;
    }

    res.json(summary);
  })
);

territoriesRouter.get(
  "/bbox",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(BboxQuerySchema, req.query, res);
    if (!parsed) return;

    const { rows } = await pool.query(
      `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
       FROM territories
       WHERE ST_Intersects(
         geometry,
         ST_MakeEnvelope($1, $2, $3, $4, 4326)
       )
       ORDER BY ubigeo
       LIMIT 500`,
      [parsed.minx, parsed.miny, parsed.maxx, parsed.maxy]
    );

    res.json({
      resultados: rows.map((row) => territoryFromRow(row as Record<string, unknown>)),
    });
  })
);
