import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Handler para `geo_intersections_comunidades` — GET /api/communities.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/rural-communities.ts` (`GET /`).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

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
  params.push(limit, offset);

  const { rows } = await db.query<NeonRow>(query, params);
  return { status: 200, body: rows };
}

/**
 * Handler para `geo_intersections_comunidad_detalle` — GET /api/communities/{objectid}.
 * SQL idéntico al de `rural-communities.ts` (`GET /:objectid`).
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const objectid = args.objectid as string;

  const { rows } = await db.query<NeonRow>(
    "SELECT * FROM rural_communities WHERE objectid = $1",
    [objectid]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Comunidad no encontrada" } };
  }
  return { status: 200, body: rows[0] };
}

/**
 * Handler para `geo_intersections_comunidades_intersect` — GET /api/communities/intersect.
 * SQL idéntico al de `rural-communities.ts` (`GET /intersect`).
 */
export async function intersect(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const geometry = args.geometry as string | undefined;

  if (!geometry) {
    return { status: 400, body: { error: "Se requiere parámetro geometry (GeoJSON)" } };
  }

  const { rows } = await db.query<NeonRow>(
    `SELECT * FROM rural_communities
     WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON($1))
     ORDER BY nombre`,
    [geometry]
  );
  return { status: 200, body: rows };
}

/**
 * Handler para `geo_intersections_comunidades_stats` — GET /api/communities/stats.
 * SQL idéntico al de `rural-communities.ts` (`GET /stats`).
 */
export async function stats(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(`
    SELECT
      capa,
      COUNT(*) as total,
      COUNT(geometry) as con_geometria,
      SUM(area_km2) as area_total_km2
    FROM rural_communities
    GROUP BY capa
    ORDER BY capa
  `);
  return { status: 200, body: rows };
}
