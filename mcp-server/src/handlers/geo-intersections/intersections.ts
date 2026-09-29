import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `geo_intersections_cruce_punto` — GET /api/cruce/punto.
 *
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`
 * (`GET /punto`). PostGIS: `ST_Contains` para punto exacto, `ST_DWithin` para
 * radio. Requiere la extensión `postgis` habilitada en la base
 * `geo_intersections` de Neon (ver nota del reporte final).
 */
export async function crucePunto(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  const radio_km = args.radio_km !== undefined ? Number(args.radio_km) : 0;

  const pointWKT = `SRID=4326;POINT(${lon} ${lat})`;

  if (radio_km === 0) {
    const [mining, forest] = await Promise.all([
      db.query<NeonRow>(
        `SELECT codigou, concesion, titular, estado, sustancia, departamento, hectareas
         FROM mining_rights
         WHERE ST_Contains(geometry, ST_GeomFromText($1, 4326))`,
        [pointWKT]
      ),
      db.query<NeonRow>(
        `SELECT capa, objectid, fuente, nom_dep, sup_sig, sup_apr
         FROM forest_titles
         WHERE ST_Contains(geometry, ST_GeomFromText($1, 4326))`,
        [pointWKT]
      ),
    ]);

    return {
      status: 200,
      body: {
        punto: { lat, lon },
        tipo: "punto_exacto",
        derechos_mineros: mining.rows,
        titulos_forestales: forest.rows,
        fuente: {
          nota: "Punto coverage: ST_Contains. Para buscar en radio usar ?radio_km=N.",
        },
      },
    };
  }

  // Buffer circular en grados (1° ≈ 111 km en Ecuador/Perú)
  const bufferDeg = radio_km / 111.0;
  const [mining, forest] = await Promise.all([
    db.query<NeonRow>(
      `SELECT m.codigou, m.concesion, m.titular, m.estado, m.sustancia,
              m.departamento,
              ST_Distance(m.geometry::geography, ST_GeomFromText($1,4326)::geography) / 1000 AS distancia_km
       FROM mining_rights m, LATERAL (SELECT ST_GeomFromText($1, 4326) AS pt) AS p
       WHERE ST_DWithin(m.geometry, p.pt, $2)
       ORDER BY distancia_km`,
      [pointWKT, bufferDeg]
    ),
    db.query<NeonRow>(
      `SELECT f.capa, f.objectid, f.fuente, f.nom_dep, f.sup_sig,
              ST_Distance(f.geometry::geography, ST_GeomFromText($1,4326)::geography) / 1000 AS distancia_km
       FROM forest_titles f, LATERAL (SELECT ST_GeomFromText($1, 4326) AS pt) AS p
       WHERE ST_DWithin(f.geometry, p.pt, $2)
       ORDER BY distancia_km`,
      [pointWKT, bufferDeg]
    ),
  ]);

  return {
    status: 200,
    body: {
      punto: { lat, lon },
      radio_km,
      tipo: "buffer",
      derechos_mineros: mining.rows,
      titulos_forestales: forest.rows,
      fuente: { nota: `Buffer circular de ${bufferDeg}° ≈ ${radio_km} km` },
    },
  };
}

/**
 * Handler para `geo_intersections_minero` — GET /api/cruce/minero/{codigou}.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`.
 */
export async function minero(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const codigou = args.codigou as string;

  const { rows: derechos } = await db.query<NeonRow>(
    `SELECT codigou, concesion, titular, estado, sustancia,
            departamento, hectareas, area_km2
     FROM mining_rights WHERE codigou = $1`,
    [codigou]
  );

  if (derechos.length === 0) {
    return { status: 404, body: { error: "Derecho minero no encontrado." } };
  }

  const { rows: intersecciones } = await db.query<NeonRow>(
    `SELECT i.*, m.concesion AS mining_concesion, m.titular AS mining_titular,
            f.capa AS forest_capa, f.fuente AS forest_fuente, f.nom_dep AS forest_nom_dep
     FROM intersection_results i
     JOIN mining_rights m ON m.codigou = i.mining_codigou
     JOIN forest_titles f ON f.capa = i.forest_capa AND f.objectid = i.forest_objectid
     WHERE i.mining_codigou = $1
     ORDER BY i.intersection_area_km2 DESC`,
    [codigou]
  );

  return { status: 200, body: { derecho: derechos[0], intersecciones } };
}

/**
 * Handler para `geo_intersections_forestal` — GET /api/cruce/forestal/{capa}/{objectid}.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`.
 */
export async function forestal(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string;
  const objectid = Number(args.objectid);

  const { rows: titulos } = await db.query<NeonRow>(
    `SELECT capa, objectid, fuente, nom_dep, sup_sig, sup_apr, area_km2
     FROM forest_titles WHERE capa = $1 AND objectid = $2`,
    [capa, objectid]
  );

  if (titulos.length === 0) {
    return { status: 404, body: { error: "Título forestal no encontrado." } };
  }

  const { rows: intersecciones } = await db.query<NeonRow>(
    `SELECT i.*, m.codigou AS mining_codigou, m.concesion AS mining_concesion,
            m.titular AS mining_titular, m.sustancia AS mining_sustancia,
            m.departamento AS mining_departamento
     FROM intersection_results i
     JOIN mining_rights m ON m.codigou = i.mining_codigou
     WHERE i.forest_capa = $1 AND i.forest_objectid = $2
     ORDER BY i.intersection_area_km2 DESC`,
    [capa, objectid]
  );

  return { status: 200, body: { titulo: titulos[0], intersecciones } };
}

/**
 * Handler para `geo_intersections_reporte` — GET /api/cruce/report.
 *
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`
 * (`GET /report`). La ruta Express original envuelve COUNT + SELECT en una
 * transacción `REPEATABLE READ` (vía `pool.connect()`) para que ambas lean el
 * mismo snapshot; `NeonPool` no expone un cliente persistente/transacción
 * multi-statement (cada `query()` abre y cierra su propia conexión — ver
 * `mcp-server/src/db/neon-pool.ts`), así que aquí las dos consultas van
 * secuenciales sin BEGIN/COMMIT explícito, igual que el resto de los
 * handlers de este bundle (ej. `execution.ts`). El texto SQL de cada
 * consulta es idéntico al original.
 */
export async function reporte(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const sustancia = args.sustancia as string | undefined;
  const capa = args.capa as string | undefined;
  const min_area_km2 = args.min_area_km2 !== undefined ? Number(args.min_area_km2) : undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (departamento) conditions.push(`i.mining_departamento = ${add(departamento)}`);
  if (sustancia) conditions.push(`m.sustancia = ${add(sustancia)}`);
  if (capa) conditions.push(`i.forest_capa = ${add(capa)}`);
  if (min_area_km2 !== undefined) conditions.push(`i.intersection_area_km2 >= ${add(min_area_km2)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const lp = (v: unknown) => {
    listParams.push(v);
    return `$${listParams.length}`;
  };

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM intersection_results i
     JOIN mining_rights m ON m.codigou = i.mining_codigou
     WHERE ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows } = await db.query<NeonRow>(
    `SELECT i.mining_codigou, i.mining_concesion, i.mining_titular,
            i.mining_estado, i.mining_sustancia, i.mining_departamento,
            i.mining_area_km2,
            i.forest_capa, i.forest_objectid, i.forest_fuente,
            i.forest_nom_dep, i.forest_area_km2,
            i.intersection_area_km2,
            i.mining_overlap_pct, i.forest_overlap_pct,
            i.computed_at
     FROM intersection_results i
     JOIN mining_rights m ON m.codigou = i.mining_codigou
     WHERE ${whereSql}
     ORDER BY i.intersection_area_km2 DESC
     LIMIT ${lp(limit)} OFFSET ${lp(offset)}`,
    listParams
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows,
      fuente: {
        dataset: "INGEMMET ∩ SERFOR — superposiciones mineras y forestales",
        nota: "Solo incluye derechos mineros y títulos forestales que tienen geometría en la base. El reporte se regenera con npm run ingest:intersections.",
      },
    },
  };
}

/**
 * Handler para `geo_intersections_stats` — GET /api/cruce/stats.
 * SQL idéntico al de `apps/geo-intersections/api/src/routes/intersections.ts`.
 */
export async function stats(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  // Secuencial, no Promise.all: son 7 queries y el Worker tiene tope de
  // conexiones simultáneas por invocación (cada NeonPool.query abre su propia
  // conexión).
  const rightsCount = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM mining_rights");
  const titlesCount = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM forest_titles");
  const intersectionsCount = await db.query<{ count: string }>("SELECT COUNT(*) AS count FROM intersection_results");
  const byDepartamento = await db.query<{ departamento: string; count: string }>(
    `SELECT mining_departamento AS departamento, COUNT(*) AS count
     FROM intersection_results GROUP BY 1 ORDER BY count DESC LIMIT 10`
  );
  const bySustancia = await db.query<{ sustancia: string; count: string }>(
    `SELECT m.sustancia, COUNT(*) AS count
     FROM intersection_results i
     JOIN mining_rights m ON m.codigou = i.mining_codigou
     GROUP BY 1 ORDER BY count DESC LIMIT 10`
  );
  const byCapa = await db.query<{ capa: string; count: string }>(
    `SELECT forest_capa AS capa, COUNT(*) AS count
     FROM intersection_results GROUP BY 1 ORDER BY count DESC`
  );
  const lastBatch = await db.query<{ computed_at: string }>(
    `SELECT computed_at FROM intersection_results
     ORDER BY computed_at DESC LIMIT 1`
  );

  return {
    status: 200,
    body: {
      resumen: {
        derechos_mineros_con_geometria: Number(rightsCount.rows[0].count),
        titulos_forestales_con_geometria: Number(titlesCount.rows[0].count),
        total_intersecciones: Number(intersectionsCount.rows[0].count),
      },
      por_departamento: byDepartamento.rows.map((r) => ({
        departamento: r.departamento,
        intersecciones: Number(r.count),
      })),
      por_sustancia: bySustancia.rows.map((r) => ({
        sustancia: r.sustancia,
        intersecciones: Number(r.count),
      })),
      por_capa_forestal: byCapa.rows.map((r) => ({
        capa: r.capa,
        intersecciones: Number(r.count),
      })),
      ultima_interseccion: lastBatch.rows[0]?.computed_at ?? null,
    },
  };
}
