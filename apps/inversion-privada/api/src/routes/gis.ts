import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { INEI_DEPARTMENTS } from "../ingest/normalize.js";

export const gisRouter = Router();

const GisGeojsonQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

function resolveIneiCode(departamento: string): string | null {
  const needle = departamento.trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
  const match = INEI_DEPARTMENTS.find(
    (d) => d.name.normalize("NFD").replace(/\p{M}/gu, "") === needle
  );
  return match?.code ?? null;
}

/**
 * Devuelve un GeoJSON `FeatureCollection` real — no un envoltorio propio —
 * pensado para usarse directo en un mapa o descargarse. Cierra el límite
 * "sin mapa descargable" que documentaban ADR-0011 y el data contract: el
 * GIS oficial (`vertix.proinversion.gob.pe`) requiere sesión para su visor,
 * pero el endpoint que ese mismo visor consume internamente no la requiere.
 */
gisRouter.get(
  "/geojson",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(GisGeojsonQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.departamento) {
      const ineiCode = resolveIneiCode(parsed.departamento);
      if (!ineiCode) {
        res.status(400).json({ error: `Departamento desconocido: ${parsed.departamento}` });
        return;
      }
      values.push(ineiCode);
      conditions.push(`$${values.length} = ANY(g.departamentos_inei)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT g.codigo, g.id_proyecto, g.nombre_proyecto, g.sector, g.fase, g.tipo_proyecto,
              g.departamentos_inei, g.tipo_coordenada, g.geometry
       FROM vertix_project_geometries g
       ${where}
       ORDER BY g.codigo`,
      values
    );

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          codigo: r.codigo,
          idProyecto: r.id_proyecto,
          nombreProyecto: r.nombre_proyecto,
          sector: r.sector,
          fase: r.fase,
          tipoProyecto: r.tipo_proyecto,
          departamentosInei: r.departamentos_inei,
          tipoCoordenada: r.tipo_coordenada,
        },
      })),
      fuente: { dataset: "PROINVERSIÓN / VERTIX GIS (ListaRegistrosCapas)" },
    });
  })
);

gisRouter.get(
  "/projects/:vertixId",
  asyncHandler(async (req, res) => {
    const vertixId = Number(req.params.vertixId);
    if (!Number.isInteger(vertixId) || vertixId <= 0) {
      res.status(400).json({ error: "vertixId inválido." });
      return;
    }

    const { rows } = await pool.query(
      `SELECT g.codigo, g.id_proyecto, g.nombre_proyecto, g.sector, g.fase, g.tipo_proyecto,
              g.departamentos_inei, g.tipo_coordenada, g.geometry
       FROM vertix_project_geometries g
       WHERE g.id_proyecto = $1
       ORDER BY g.codigo`,
      [vertixId]
    );

    res.json({
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          codigo: r.codigo,
          idProyecto: r.id_proyecto,
          nombreProyecto: r.nombre_proyecto,
          sector: r.sector,
          fase: r.fase,
          tipoProyecto: r.tipo_proyecto,
          departamentosInei: r.departamentos_inei,
          tipoCoordenada: r.tipo_coordenada,
        },
      })),
    });
  })
);
