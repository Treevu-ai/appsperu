/**
 * rural-communities.ts — Rutas API para Comunidades Campesinas/Nativas.
 *
 * Endpoints para consultar datos de comunidades rurales de SERFOR OCAPAS_MIDAGRI.
 */

import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

const router = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const CAPA_VALUES = ["comunidades_campesinas", "comunidades_nativas"] as const;

// ORDER BY nombre con tie-breaker determinístico: "nombre" no es único, así que
// paginar solo por él (OFFSET) puede repetir/omitir filas entre páginas con el
// mismo nombre (hallazgo real de revisión CodeRabbit/Copilot).
const ORDER_BY_DETERMINISTICO = "ORDER BY nombre, capa, objectid";

const GEOJSON_GEOMETRY_TYPES = new Set([
  "Point", "MultiPoint", "LineString", "MultiLineString",
  "Polygon", "MultiPolygon", "GeometryCollection",
]);

/** Valida que sea un string JSON con forma de geometría GeoJSON antes de llegar a
 *  ST_GeomFromGeoJSON — sin esto, JSON malformado o no-geometría cae en un 500 de
 *  Postgres en vez de un 400 de validación (hallazgo real de revisión). */
const geometryParam = z.string().min(1).refine(
  (value) => {
    try {
      const parsed = JSON.parse(value);
      return (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.type === "string" &&
        GEOJSON_GEOMETRY_TYPES.has(parsed.type)
      );
    } catch {
      return false;
    }
  },
  { message: 'Debe ser un GeoJSON geometry válido (JSON con "type" reconocido).' }
);

const ListQuerySchema = z.object({
  capa: z.enum(CAPA_VALUES).optional(),
  departamento: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/communities?capa=comunidades_campesinas&departamento=LA LIBERTAD&limit=100&offset=0
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const p = parseQuery(ListQuerySchema, req.query, res);
    if (!p) return;
    const { capa, departamento, limit, offset } = p;

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

    query += ` ${ORDER_BY_DETERMINISTICO} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  })
);

const IntersectQuerySchema = z.object({
  geometry: geometryParam,
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/communities/intersect?geometry=<geojson>&limit=&offset=
// Debe declararse antes de "/:objectid" — si no, Express la matchea como objectid="intersect".
router.get(
  "/intersect",
  asyncHandler(async (req, res) => {
    const p = parseQuery(IntersectQuerySchema, req.query, res);
    if (!p) return;
    const { geometry, limit, offset } = p;

    const result = await pool.query(
      `SELECT * FROM rural_communities
       WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON($1))
       ${ORDER_BY_DETERMINISTICO}
       LIMIT $2 OFFSET $3`,
      [geometry, limit, offset]
    );
    res.json(result.rows);
  })
);

// GET /api/communities/stats
// Debe declararse antes de "/:objectid" — mismo motivo que /intersect.
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
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
  })
);

const DetalleParamsSchema = z.object({
  objectid: z.coerce.number().int().min(-2147483648).max(2147483647),
});
const DetalleQuerySchema = z.object({
  capa: z.enum(CAPA_VALUES),
});

// GET /api/communities/:objectid?capa=comunidades_campesinas
// `objectid` por sí solo NO es clave única (la tabla garantiza UNIQUE(capa, objectid),
// no UNIQUE(objectid) a solas) — confirmado con datos reales: PUCA URCO
// (comunidades_campesinas) y LAS MALVINAS (comunidades_nativas) comparten objectid=1.
// Sin `capa`, esta ruta devolvía una fila arbitraria de las dos (hallazgo real de
// revisión CodeRabbit/Copilot). `capa` es obligatorio en query, no inventa un valor.
router.get(
  "/:objectid",
  asyncHandler(async (req, res) => {
    const params = parseQuery(DetalleParamsSchema, req.params, res);
    if (!params) return;
    const query = parseQuery(DetalleQuerySchema, req.query, res);
    if (!query) return;

    const result = await pool.query(
      "SELECT * FROM rural_communities WHERE objectid = $1 AND capa = $2",
      [params.objectid, query.capa]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comunidad no encontrada" });
    }
    res.json(result.rows[0]);
  })
);

export const ruralCommunitiesRouter = router;
