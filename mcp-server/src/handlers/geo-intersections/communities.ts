import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const CAPA_VALUES = new Set(["comunidades_campesinas", "comunidades_nativas"]);

// ORDER BY nombre con tie-breaker determinístico: "nombre" no es único, así que
// paginar solo por él (OFFSET) puede repetir/omitir filas entre páginas con el
// mismo nombre (hallazgo real de revisión CodeRabbit/Copilot).
const ORDER_BY_DETERMINISTICO = "ORDER BY nombre, capa, objectid";

const GEOJSON_GEOMETRY_TYPES = new Set([
  "Point", "MultiPoint", "LineString", "MultiLineString",
  "Polygon", "MultiPolygon", "GeometryCollection",
]);

function isValidGeoJsonGeometry(value: string): boolean {
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
}

/** `validateArgs` (ver `mcp-server/src/index.ts`) ya aplica el `querySchema` del
 *  catálogo antes de llegar aquí, pero estos handlers también se pueden invocar
 *  directamente en tests/otros contextos — se revalida localmente el mismo
 *  contrato por defensa en profundidad, igual que el resto de los handlers que
 *  tienen reglas más allá de tipo/presencia (ver `parseLimit`). */
function parseLimit(value: unknown): number {
  const n = value === undefined ? DEFAULT_LIMIT : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return DEFAULT_LIMIT;
  return n;
}

function parseOffset(value: unknown): number {
  const n = value === undefined ? 0 : Number(value);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

/**
 * Handler para `geo_intersections_comunidades` — GET /api/communities.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/rural-communities.ts` (`GET /`).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const limit = parseLimit(args.limit);
  const offset = parseOffset(args.offset);

  if (capa !== undefined && !CAPA_VALUES.has(capa)) {
    return { status: 400, body: { error: `capa inválida: "${capa}"` } };
  }

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

  const { rows } = await db.query<NeonRow>(query, params);
  return { status: 200, body: rows };
}

/**
 * Handler para `geo_intersections_comunidad_detalle` — GET /api/communities/{objectid}.
 *
 * `objectid` por sí solo NO es clave única (la tabla garantiza UNIQUE(capa, objectid),
 * no UNIQUE(objectid) a solas) — confirmado con datos reales: PUCA URCO
 * (comunidades_campesinas) y LAS MALVINAS (comunidades_nativas) comparten objectid=1.
 * `capa` es un argumento obligatorio, no inventa un valor por defecto.
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const objectidRaw = args.objectid;
  const capa = args.capa as string | undefined;

  const objectid = Number(objectidRaw);
  if (!Number.isInteger(objectid) || objectid < -2147483648 || objectid > 2147483647) {
    return { status: 400, body: { error: "objectid debe ser un entero válido (int32)" } };
  }
  if (!capa || !CAPA_VALUES.has(capa)) {
    return { status: 400, body: { error: "Se requiere el parámetro capa (comunidades_campesinas|comunidades_nativas)" } };
  }

  const { rows } = await db.query<NeonRow>(
    "SELECT * FROM rural_communities WHERE objectid = $1 AND capa = $2",
    [objectid, capa]
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
  const limit = parseLimit(args.limit);
  const offset = parseOffset(args.offset);

  if (!geometry || !isValidGeoJsonGeometry(geometry)) {
    return {
      status: 400,
      body: { error: 'Se requiere parámetro geometry con forma de GeoJSON válido (JSON con "type" reconocido)' },
    };
  }

  const { rows } = await db.query<NeonRow>(
    `SELECT * FROM rural_communities
     WHERE ST_Intersects(geometry, ST_GeomFromGeoJSON($1))
     ${ORDER_BY_DETERMINISTICO}
     LIMIT $2 OFFSET $3`,
    [geometry, limit, offset]
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
