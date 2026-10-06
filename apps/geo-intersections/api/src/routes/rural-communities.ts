/**
 * rural-communities.ts — Rutas API para Comunidades Campesinas/Nativas.
 *
 * Endpoints para consultar datos de comunidades rurales de SERFOR OCAPAS_MIDAGRI.
 */

import { Router } from "express";
import { pool } from "../db/pool.js";

const router = Router();

// GET /api/communities?capa=comunidades_campesinas&departamento=LA LIBERTAD&limit=100&offset=0
router.get("/", async (req, res) => {
  const { capa, departamento, limit = "100", offset = "0" } = req.query;

  let query = "SELECT * FROM rural_communities WHERE 1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (capa) {
    query += ` AND capa = $${paramIndex++}`;
    params.push(capa);
  }

  if (departamento) {
    query += ` AND departamento ILIKE $${paramIndex++}`;
    params.push(`%${departamento}%`);
  }

  query += ` ORDER BY nombre LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error en GET /api/communities:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/communities/intersect?geometry=<geojson>
// Debe declararse antes de "/:objectid" — si no, Express la matchea como objectid="intersect".
router.get("/intersect", async (req, res) => {
  const { geometry } = req.query;
  if (!geometry) {
    return res.status(400).json({ error: "Se requiere parámetro geometry (GeoJSON)" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM rural_communities
       WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON($1))
       ORDER BY nombre`,
      [geometry]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error en GET /api/communities/intersect:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/communities/stats
// Debe declararse antes de "/:objectid" — mismo motivo que /intersect.
router.get("/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        capa,
        COUNT(*) as total,
        COUNT(geometry) as con_geometria,
        SUM(area_km2) as area_total_km2
      FROM rural_communities
      GROUP BY capa
      ORDER BY capa
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error en GET /api/communities/stats:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /api/communities/:objectid
router.get("/:objectid", async (req, res) => {
  const { objectid } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM rural_communities WHERE objectid = $1",
      [objectid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comunidad no encontrada" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en GET /api/communities/:objectid:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

export const ruralCommunitiesRouter = router;
