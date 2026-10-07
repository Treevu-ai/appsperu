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

  const [minero, forestal, coberturaMinero, coberturaForestal] = await Promise.all([
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
    db.query<NeonRow>(
      `SELECT area_cubierta_km2, pct_cobertura, num_derechos, computed_at
       FROM community_mining_coverage WHERE community_capa = $1 AND community_objectid = $2`,
      [capa, objectid]
    ),
    db.query<NeonRow>(
      `SELECT area_cubierta_km2, pct_cobertura, num_titulos, computed_at
       FROM community_forest_coverage WHERE community_capa = $1 AND community_objectid = $2`,
      [capa, objectid]
    ),
  ]);

  return {
    status: 200,
    body: {
      comunidad: comunidades[0],
      superposiciones_minero: minero.rows,
      superposiciones_forestal: forestal.rows,
      // Cobertura REAL (ST_Union) -- no es la suma de community_overlap_pct de arriba, que
      // sobrestima cuando dos derechos/títulos distintos se solapan entre sí.
      cobertura_minero_real: coberturaMinero.rows[0] ?? null,
      cobertura_forestal_real: coberturaForestal.rows[0] ?? null,
    },
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
 * Handler para `geo_intersections_comunidad_minero_cobertura` — GET /api/cruce/comunidad-minero/cobertura.
 * SQL idéntico al de `intersections.ts` (`GET /comunidad-minero/cobertura`). A diferencia de
 * `reporteMinero` (una fila por par), esto es una fila por COMUNIDAD con cobertura REAL
 * (ST_Union de todos los derechos antes de medir) -- nunca supera 100%.
 */
export async function coberturaMinero(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const min_pct = args.min_pct !== undefined ? Number(args.min_pct) : undefined;
  const min_area_km2 = args.min_area_km2 !== undefined ? Number(args.min_area_km2) : undefined;
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
  if (provincia) conditions.push(`community_provincia = ${add(provincia)}`);
  if (distrito) conditions.push(`community_distrito = ${add(distrito)}`);
  if (min_pct !== undefined) conditions.push(`pct_cobertura >= ${add(min_pct)}`);
  if (min_area_km2 !== undefined) conditions.push(`area_cubierta_km2 >= ${add(min_area_km2)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const lp = (v: unknown) => { listParams.push(v); return `$${listParams.length}`; };

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM community_mining_coverage WHERE ${whereSql}`, params),
    db.query<NeonRow>(
      `SELECT community_capa, community_objectid, community_nombre, community_departamento,
              community_provincia, community_distrito, community_area_km2,
              area_cubierta_km2, pct_cobertura, num_derechos, computed_at
       FROM community_mining_coverage
       WHERE ${whereSql}
       ORDER BY pct_cobertura DESC
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

/** Handler para `geo_intersections_comunidad_forestal_cobertura` — análogo con forest_titles. */
export async function coberturaForestal(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const min_pct = args.min_pct !== undefined ? Number(args.min_pct) : undefined;
  const min_area_km2 = args.min_area_km2 !== undefined ? Number(args.min_area_km2) : undefined;
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
  if (provincia) conditions.push(`community_provincia = ${add(provincia)}`);
  if (distrito) conditions.push(`community_distrito = ${add(distrito)}`);
  if (min_pct !== undefined) conditions.push(`pct_cobertura >= ${add(min_pct)}`);
  if (min_area_km2 !== undefined) conditions.push(`area_cubierta_km2 >= ${add(min_area_km2)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const lp = (v: unknown) => { listParams.push(v); return `$${listParams.length}`; };

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM community_forest_coverage WHERE ${whereSql}`, params),
    db.query<NeonRow>(
      `SELECT community_capa, community_objectid, community_nombre, community_departamento,
              community_provincia, community_distrito, community_area_km2,
              area_cubierta_km2, pct_cobertura, num_titulos, computed_at
       FROM community_forest_coverage
       WHERE ${whereSql}
       ORDER BY pct_cobertura DESC
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
    coberturaBuckets, coberturaDobleExposicion,
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
    db.query<{ menor_10: string; entre_10_50: string; entre_50_90: string; mayor_90: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE pct_cobertura < 10) AS menor_10,
        COUNT(*) FILTER (WHERE pct_cobertura >= 10 AND pct_cobertura < 50) AS entre_10_50,
        COUNT(*) FILTER (WHERE pct_cobertura >= 50 AND pct_cobertura < 90) AS entre_50_90,
        COUNT(*) FILTER (WHERE pct_cobertura >= 90) AS mayor_90
      FROM community_mining_coverage
    `),
    db.query<{ count: string }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT community_capa, community_objectid FROM community_mining_coverage
        INTERSECT
        SELECT community_capa, community_objectid FROM community_forest_coverage
      ) x
    `),
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
        comunidades_con_doble_exposicion: Number(coberturaDobleExposicion.rows[0].count),
      },
      cobertura_minero_por_severidad: {
        nota: "Cobertura REAL (ST_Union), ver geo_intersections_comunidad_minero_cobertura. No es la suma de community_overlap_pct.",
        menor_10pct: Number(coberturaBuckets.rows[0].menor_10),
        entre_10_50pct: Number(coberturaBuckets.rows[0].entre_10_50),
        entre_50_90pct: Number(coberturaBuckets.rows[0].entre_50_90),
        mayor_90pct: Number(coberturaBuckets.rows[0].mayor_90),
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
