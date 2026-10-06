import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const CAPA_VALUES = new Set(["comunidades_campesinas", "comunidades_nativas"]);

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
 * Handler para `geo_intersections_comunidad_cruce` — GET /api/cruce/comunidad/{capa}/{objectid}.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`
 * (`GET /comunidad/:capa/:objectid`). Fuente: community_mining_intersections /
 * community_forest_intersections (ver compute-community-intersections.ts).
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const objectidRaw = args.objectid;

  const objectid = Number(objectidRaw);
  if (!Number.isInteger(objectid) || objectid < -2147483648 || objectid > 2147483647) {
    return { status: 400, body: { error: "objectid debe ser un entero válido (int32)" } };
  }
  if (!capa || !CAPA_VALUES.has(capa)) {
    return { status: 400, body: { error: "capa debe ser comunidades_campesinas o comunidades_nativas" } };
  }

  const { rows: comunidades } = await db.query<NeonRow>(
    "SELECT capa, objectid, nombre, departamento, provincia, distrito, area_km2 FROM rural_communities WHERE capa = $1 AND objectid = $2",
    [capa, objectid]
  );
  if (comunidades.length === 0) {
    return { status: 404, body: { error: "Comunidad no encontrada." } };
  }

  const [minero, forestal] = await Promise.all([
    db.query<NeonRow>(
      `SELECT mining_codigou, mining_concesion, mining_titular, mining_estado, mining_sustancia,
              mining_area_km2, intersection_area_km2, community_overlap_pct, mining_overlap_pct, computed_at
       FROM community_mining_intersections
       WHERE community_capa = $1 AND community_objectid = $2
       ORDER BY intersection_area_km2 DESC`,
      [capa, objectid]
    ),
    db.query<NeonRow>(
      `SELECT forest_capa, forest_objectid, forest_fuente, forest_nom_dep,
              forest_area_km2, intersection_area_km2, community_overlap_pct, forest_overlap_pct, computed_at
       FROM community_forest_intersections
       WHERE community_capa = $1 AND community_objectid = $2
       ORDER BY intersection_area_km2 DESC`,
      [capa, objectid]
    ),
  ]);

  return {
    status: 200,
    body: { comunidad: comunidades[0], superposiciones_minero: minero.rows, superposiciones_forestal: forestal.rows },
  };
}

/**
 * Handler para `geo_intersections_comunidad_minero_reporte` — GET /api/cruce/comunidad-minero/report.
 * SQL idéntico al de `intersections.ts` (`GET /comunidad-minero/report`).
 */
export async function reporteMinero(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const titular = args.titular as string | undefined;
  const min_area_km2 = args.min_area_km2 !== undefined ? Number(args.min_area_km2) : undefined;
  const min_community_overlap_pct = args.min_community_overlap_pct !== undefined ? Number(args.min_community_overlap_pct) : undefined;
  const limit = parseLimit(args.limit);
  const offset = parseOffset(args.offset);

  if (capa !== undefined && !CAPA_VALUES.has(capa)) {
    return { status: 400, body: { error: `capa inválida: "${capa}"` } };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (capa) conditions.push(`community_capa = ${add(capa)}`);
  if (departamento) conditions.push(`community_departamento = ${add(departamento)}`);
  if (titular) conditions.push(`mining_titular ILIKE ${add(`%${titular}%`)}`);
  if (min_area_km2 !== undefined) conditions.push(`intersection_area_km2 >= ${add(min_area_km2)}`);
  if (min_community_overlap_pct !== undefined) conditions.push(`community_overlap_pct >= ${add(min_community_overlap_pct)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const lp = (v: unknown) => { listParams.push(v); return `$${listParams.length}`; };

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM community_mining_intersections WHERE ${whereSql}`, params),
    db.query<NeonRow>(
      `SELECT community_capa, community_objectid, community_nombre, community_departamento, community_provincia,
              community_area_km2, mining_codigou, mining_concesion, mining_titular, mining_estado, mining_sustancia,
              mining_area_km2, intersection_area_km2, community_overlap_pct, mining_overlap_pct, computed_at
       FROM community_mining_intersections
       WHERE ${whereSql}
       ORDER BY intersection_area_km2 DESC
       LIMIT ${lp(limit)} OFFSET ${lp(offset)}`,
      listParams
    ),
  ]);

  const total = Number(countRes.rows[0].total);
  return {
    status: 200,
    body: { total, limit, offset, hasMore: offset + rowsRes.rows.length < total, resultados: rowsRes.rows },
  };
}

/**
 * Handler para `geo_intersections_comunidad_forestal_reporte` — GET /api/cruce/comunidad-forestal/report.
 * SQL idéntico al de `intersections.ts` (`GET /comunidad-forestal/report`).
 */
export async function reporteForestal(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const forestCapa = args.forest_capa as string | undefined;
  const min_area_km2 = args.min_area_km2 !== undefined ? Number(args.min_area_km2) : undefined;
  const min_community_overlap_pct = args.min_community_overlap_pct !== undefined ? Number(args.min_community_overlap_pct) : undefined;
  const limit = parseLimit(args.limit);
  const offset = parseOffset(args.offset);

  if (capa !== undefined && !CAPA_VALUES.has(capa)) {
    return { status: 400, body: { error: `capa inválida: "${capa}"` } };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (capa) conditions.push(`community_capa = ${add(capa)}`);
  if (departamento) conditions.push(`community_departamento = ${add(departamento)}`);
  if (forestCapa) conditions.push(`forest_capa = ${add(forestCapa)}`);
  if (min_area_km2 !== undefined) conditions.push(`intersection_area_km2 >= ${add(min_area_km2)}`);
  if (min_community_overlap_pct !== undefined) conditions.push(`community_overlap_pct >= ${add(min_community_overlap_pct)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const lp = (v: unknown) => { listParams.push(v); return `$${listParams.length}`; };

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM community_forest_intersections WHERE ${whereSql}`, params),
    db.query<NeonRow>(
      `SELECT community_capa, community_objectid, community_nombre, community_departamento, community_provincia,
              community_area_km2, forest_capa, forest_objectid, forest_fuente, forest_nom_dep,
              forest_area_km2, intersection_area_km2, community_overlap_pct, forest_overlap_pct, computed_at
       FROM community_forest_intersections
       WHERE ${whereSql}
       ORDER BY intersection_area_km2 DESC
       LIMIT ${lp(limit)} OFFSET ${lp(offset)}`,
      listParams
    ),
  ]);

  const total = Number(countRes.rows[0].total);
  return {
    status: 200,
    body: { total, limit, offset, hasMore: offset + rowsRes.rows.length < total, resultados: rowsRes.rows },
  };
}

/**
 * Handler para `geo_intersections_comunidad_cruce_stats` — GET /api/cruce/comunidad/stats.
 * SQL idéntico al de `intersections.ts` (`GET /comunidad/stats`).
 */
export async function stats(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const [
    comunidadesCount, mineroCount, forestalCount,
    comunidadesAfectadasMinero, comunidadesAfectadasForestal,
    topTitulares, porCapaForestal, ultimoBatchMinero, ultimoBatchForestal,
  ] = await Promise.all([
    db.query<{ count: string }>("SELECT COUNT(*) AS count FROM rural_communities"),
    db.query<{ count: string }>("SELECT COUNT(*) AS count FROM community_mining_intersections"),
    db.query<{ count: string }>("SELECT COUNT(*) AS count FROM community_forest_intersections"),
    db.query<{ count: string }>("SELECT COUNT(DISTINCT (community_capa, community_objectid)) AS count FROM community_mining_intersections"),
    db.query<{ count: string }>("SELECT COUNT(DISTINCT (community_capa, community_objectid)) AS count FROM community_forest_intersections"),
    db.query<{ mining_titular: string; count: string }>(
      `SELECT mining_titular, COUNT(DISTINCT (community_capa, community_objectid)) AS count
       FROM community_mining_intersections GROUP BY 1 ORDER BY count DESC LIMIT 15`
    ),
    db.query<{ forest_capa: string; count: string }>(
      `SELECT forest_capa, COUNT(DISTINCT (community_capa, community_objectid)) AS count
       FROM community_forest_intersections GROUP BY 1 ORDER BY count DESC`
    ),
    db.query<{ computed_at: string }>(
      "SELECT computed_at FROM raw_community_intersection_batches WHERE tipo = 'minero' ORDER BY computed_at DESC LIMIT 1"
    ),
    db.query<{ computed_at: string }>(
      "SELECT computed_at FROM raw_community_intersection_batches WHERE tipo = 'forestal' ORDER BY computed_at DESC LIMIT 1"
    ),
  ]);

  return {
    status: 200,
    body: {
      resumen: {
        comunidades_total: Number(comunidadesCount.rows[0].count),
        pares_comunidad_minero: Number(mineroCount.rows[0].count),
        pares_comunidad_forestal: Number(forestalCount.rows[0].count),
        comunidades_afectadas_minero: Number(comunidadesAfectadasMinero.rows[0].count),
        comunidades_afectadas_forestal: Number(comunidadesAfectadasForestal.rows[0].count),
      },
      top_titulares_mineros: topTitulares.rows.map((r) => ({
        titular: r.mining_titular,
        comunidades_afectadas: Number(r.count),
      })),
      por_capa_forestal: porCapaForestal.rows.map((r) => ({
        capa: r.forest_capa,
        comunidades_afectadas: Number(r.count),
      })),
      ultima_corrida: {
        minero: ultimoBatchMinero.rows[0]?.computed_at ?? null,
        forestal: ultimoBatchForestal.rows[0]?.computed_at ?? null,
      },
    },
  };
}
