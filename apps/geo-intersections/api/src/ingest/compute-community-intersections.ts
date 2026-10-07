/**
 * compute-community-intersections.ts — Calcula superposiciones comunidades ∩ minero/forestal.
 *
 * Mismo patrón que compute-intersections.ts (minería ∩ bosque): bounding-box pre-filter
 * vía índice GIST sobre geometry_valid + ST_Intersects real + área de intersección y %
 * de solapamiento relativo a cada polígono. Dos pases independientes (comunidad∩minero,
 * comunidad∩forestal), cada uno con su propio snapshot completo (DELETE + INSERT) en su
 * propia transacción.
 *
 * Cada pase escribe en DOS tablas:
 * - `community_{mining,forest}_intersections`: una fila por PAR comunidad-derecho/título.
 *   Útil para listar "qué derechos específicos superponen esta comunidad".
 * - `community_{mining,forest}_coverage`: una fila por COMUNIDAD, con la cobertura REAL
 *   (ST_Union de todos los derechos/títulos que intersectan, medida una sola vez contra la
 *   comunidad). Necesaria porque sumar `community_overlap_pct` entre filas de la tabla de
 *   pares SOBRESTIMA cuando dos derechos/títulos distintos se solapan entre sí sobre el mismo
 *   terreno — confirmado en vivo 2026-10-06: casos reales de 131-175% al sumar ingenuamente.
 *
 * Solo considera derechos mineros TITULADOS (estado='T') — mismo criterio usado en el
 * spike real de 2026-10-06 (ver docs/data-contracts/comunidades-cruce-minero-forestal.md).
 *
 * Uso:
 *   npm run ingest:comunidad-cruce
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const BATCH_SIZE = Number(process.env.COMMUNITY_INTERSECTION_BATCH_SIZE ?? "200");

interface RawMiningIntersection {
  community_capa: string;
  community_objectid: number;
  community_nombre: string | null;
  community_departamento: string | null;
  community_provincia: string | null;
  community_area_km2: number | null;
  mining_codigou: string;
  mining_concesion: string;
  mining_titular: string;
  mining_estado: string;
  mining_sustancia: string;
  mining_area_km2: number;
  intersection_geom: string; // ST_AsGeoJSON
  intersection_area_km2: number;
  community_overlap_pct: number | null;
  mining_overlap_pct: number | null;
}

interface RawForestIntersection {
  community_capa: string;
  community_objectid: number;
  community_nombre: string | null;
  community_departamento: string | null;
  community_provincia: string | null;
  community_area_km2: number | null;
  forest_capa: string;
  forest_objectid: number;
  forest_fuente: string | null;
  forest_nom_dep: string | null;
  forest_area_km2: number;
  intersection_geom: string;
  intersection_area_km2: number;
  community_overlap_pct: number | null;
  forest_overlap_pct: number | null;
}

interface RawMiningCoverage {
  community_capa: string;
  community_objectid: number;
  community_nombre: string | null;
  community_departamento: string | null;
  community_provincia: string | null;
  community_distrito: string | null;
  community_area_km2: number | null;
  area_cubierta_km2: number;
  pct_cobertura: number | null;
  num_derechos: number;
}

interface RawForestCoverage {
  community_capa: string;
  community_objectid: number;
  community_nombre: string | null;
  community_departamento: string | null;
  community_provincia: string | null;
  community_distrito: string | null;
  community_area_km2: number | null;
  area_cubierta_km2: number;
  pct_cobertura: number | null;
  num_titulos: number;
}

const MINING_COLUMNS = [
  "community_capa", "community_objectid", "community_nombre", "community_departamento",
  "community_provincia", "community_area_km2",
  "mining_codigou", "mining_concesion", "mining_titular", "mining_estado", "mining_sustancia", "mining_area_km2",
  "intersection_geom", "intersection_area_km2", "community_overlap_pct", "mining_overlap_pct", "batch_id",
] as const;

const FOREST_COLUMNS = [
  "community_capa", "community_objectid", "community_nombre", "community_departamento",
  "community_provincia", "community_area_km2",
  "forest_capa", "forest_objectid", "forest_fuente", "forest_nom_dep", "forest_area_km2",
  "intersection_geom", "intersection_area_km2", "community_overlap_pct", "forest_overlap_pct", "batch_id",
] as const;

const MINING_COVERAGE_COLUMNS = [
  "community_capa", "community_objectid", "community_nombre", "community_departamento",
  "community_provincia", "community_distrito", "community_area_km2",
  "area_cubierta_km2", "pct_cobertura", "num_derechos", "batch_id",
] as const;

const FOREST_COVERAGE_COLUMNS = [
  "community_capa", "community_objectid", "community_nombre", "community_departamento",
  "community_provincia", "community_distrito", "community_area_km2",
  "area_cubierta_km2", "pct_cobertura", "num_titulos", "batch_id",
] as const;

function buildInsert(table: string, columns: readonly string[], rows: readonly unknown[][]): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * columns.length;
    tuples.push(
      `(${columns.map((col, j) => {
        const placeholder = `$${base + j + 1}`;
        // Mismo motivo que ocapas-connector.ts: el valor llega como string GeoJSON y
        // PostGIS no lo castea a GEOMETRY implícitamente.
        return col === "intersection_geom" ? `ST_GeomFromGeoJSON(${placeholder})` : placeholder;
      }).join(",")})`
    );
    values.push(...row);
  });
  return { sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`, values };
}

async function computeMiningBatch(client: PoolClient, communityIds: number[], batchId: number): Promise<number> {
  const ids = communityIds.map((_, i) => `$${i + 1}`).join(",");

  const result = await client.query<RawMiningIntersection>(
    `SELECT
       rc.capa AS community_capa, rc.objectid AS community_objectid, rc.nombre AS community_nombre,
       rc.departamento AS community_departamento, rc.provincia AS community_provincia,
       rc.area_km2 AS community_area_km2,
       m.codigou AS mining_codigou, m.concesion AS mining_concesion, m.titular AS mining_titular,
       m.estado AS mining_estado, m.sustancia AS mining_sustancia, m.area_km2 AS mining_area_km2,
       -- ST_CollectionExtract(..., 3) descarta componentes de punto/línea del resultado de
       -- ST_Intersection (overlaps que solo se tocan en un borde) -- sin esto, ST_Intersection
       -- puede devolver GeometryCollection, que la columna GEOMETRY(MultiPolygon,4326) rechaza
       -- (confirmado en vivo: fallo real al correr este script contra datos reales).
       ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_Intersection(rc.geometry_valid, m.geometry_valid), 3))) AS intersection_geom,
       (ST_Area(ST_Intersection(rc.geometry_valid, m.geometry_valid)::geography) / 1_000_000)::numeric AS intersection_area_km2,
       ROUND(
         (ST_Area(ST_Intersection(rc.geometry_valid, m.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(rc.area_km2, 0)::numeric, 4
       ) AS community_overlap_pct,
       ROUND(
         (ST_Area(ST_Intersection(rc.geometry_valid, m.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(m.area_km2, 0)::numeric, 4
       ) AS mining_overlap_pct
     FROM rural_communities rc
     JOIN mining_rights m ON ST_Intersects(rc.geometry_valid, m.geometry_valid) AND m.estado = 'T'
     WHERE rc.id IN (${ids})
       AND ST_Area(ST_Intersection(rc.geometry_valid, m.geometry_valid)::geography) > 0`,
    communityIds
  );

  const rows = result.rows;
  if (rows.length === 0) return 0;

  const tuples = rows.map((r) => [
    r.community_capa, r.community_objectid, r.community_nombre, r.community_departamento,
    r.community_provincia, r.community_area_km2,
    r.mining_codigou, r.mining_concesion, r.mining_titular, r.mining_estado, r.mining_sustancia, r.mining_area_km2,
    r.intersection_geom, r.intersection_area_km2, r.community_overlap_pct, r.mining_overlap_pct,
    batchId,
  ]);

  const { sql, values } = buildInsert("community_mining_intersections", MINING_COLUMNS, tuples);
  await client.query(sql, values);
  return rows.length;
}

async function computeForestBatch(client: PoolClient, communityIds: number[], batchId: number): Promise<number> {
  const ids = communityIds.map((_, i) => `$${i + 1}`).join(",");

  const result = await client.query<RawForestIntersection>(
    `SELECT
       rc.capa AS community_capa, rc.objectid AS community_objectid, rc.nombre AS community_nombre,
       rc.departamento AS community_departamento, rc.provincia AS community_provincia,
       rc.area_km2 AS community_area_km2,
       f.capa AS forest_capa, f.objectid AS forest_objectid, f.fuente AS forest_fuente, f.nom_dep AS forest_nom_dep,
       f.area_km2 AS forest_area_km2,
       ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_Intersection(rc.geometry_valid, f.geometry_valid), 3))) AS intersection_geom,
       (ST_Area(ST_Intersection(rc.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric AS intersection_area_km2,
       ROUND(
         (ST_Area(ST_Intersection(rc.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(rc.area_km2, 0)::numeric, 4
       ) AS community_overlap_pct,
       ROUND(
         (ST_Area(ST_Intersection(rc.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(f.area_km2, 0)::numeric, 4
       ) AS forest_overlap_pct
     FROM rural_communities rc
     JOIN forest_titles f ON ST_Intersects(rc.geometry_valid, f.geometry_valid)
     WHERE rc.id IN (${ids})
       AND ST_Area(ST_Intersection(rc.geometry_valid, f.geometry_valid)::geography) > 0`,
    communityIds
  );

  const rows = result.rows;
  if (rows.length === 0) return 0;

  const tuples = rows.map((r) => [
    r.community_capa, r.community_objectid, r.community_nombre, r.community_departamento,
    r.community_provincia, r.community_area_km2,
    r.forest_capa, r.forest_objectid, r.forest_fuente, r.forest_nom_dep, r.forest_area_km2,
    r.intersection_geom, r.intersection_area_km2, r.community_overlap_pct, r.forest_overlap_pct,
    batchId,
  ]);

  const { sql, values } = buildInsert("community_forest_intersections", FOREST_COLUMNS, tuples);
  await client.query(sql, values);
  return rows.length;
}

/**
 * Cobertura REAL por comunidad: ST_Union de TODOS los derechos mineros que la intersectan
 * antes de medir el área contra la comunidad — no la suma de `community_overlap_pct` de la
 * tabla de pares, que sobrestima cuando dos derechos distintos se solapan entre sí (confirmado
 * en vivo: casos reales de 131-175% al sumar ingenuamente). `LEAST(..., 100)` amortigua un
 * posible desborde de centésimas por redondeo de punto flotante entre dos `ST_MakeValid`
 * distintos — la intersección real nunca debería superar el área de la propia comunidad.
 */
async function computeMiningCoverageBatch(client: PoolClient, communityIds: number[], batchId: number): Promise<number> {
  const ids = communityIds.map((_, i) => `$${i + 1}`).join(",");

  const result = await client.query<RawMiningCoverage>(
    `SELECT
       rc.capa AS community_capa, rc.objectid AS community_objectid, rc.nombre AS community_nombre,
       rc.departamento AS community_departamento, rc.provincia AS community_provincia,
       rc.distrito AS community_distrito, rc.area_km2 AS community_area_km2,
       (ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(m.geometry_valid))::geography) / 1_000_000) AS area_cubierta_km2,
       LEAST(
         ROUND(
           (ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(m.geometry_valid))::geography) / 1_000_000)::numeric * 100
           / NULLIF(rc.area_km2, 0)::numeric, 4
         ), 100
       ) AS pct_cobertura,
       COUNT(DISTINCT m.codigou)::int AS num_derechos
     FROM rural_communities rc
     JOIN mining_rights m ON ST_Intersects(rc.geometry_valid, m.geometry_valid) AND m.estado = 'T'
     WHERE rc.id IN (${ids})
     GROUP BY rc.id, rc.capa, rc.objectid, rc.nombre, rc.departamento, rc.provincia, rc.distrito, rc.area_km2, rc.geometry_valid
     HAVING ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(m.geometry_valid))::geography) > 0`,
    communityIds
  );

  const rows = result.rows;
  if (rows.length === 0) return 0;

  const tuples = rows.map((r) => [
    r.community_capa, r.community_objectid, r.community_nombre, r.community_departamento,
    r.community_provincia, r.community_distrito, r.community_area_km2,
    r.area_cubierta_km2, r.pct_cobertura, r.num_derechos, batchId,
  ]);

  const { sql, values } = buildInsert("community_mining_coverage", MINING_COVERAGE_COLUMNS, tuples);
  await client.query(sql, values);
  return rows.length;
}

async function computeForestCoverageBatch(client: PoolClient, communityIds: number[], batchId: number): Promise<number> {
  const ids = communityIds.map((_, i) => `$${i + 1}`).join(",");

  const result = await client.query<RawForestCoverage>(
    `SELECT
       rc.capa AS community_capa, rc.objectid AS community_objectid, rc.nombre AS community_nombre,
       rc.departamento AS community_departamento, rc.provincia AS community_provincia,
       rc.distrito AS community_distrito, rc.area_km2 AS community_area_km2,
       (ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(f.geometry_valid))::geography) / 1_000_000) AS area_cubierta_km2,
       LEAST(
         ROUND(
           (ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(f.geometry_valid))::geography) / 1_000_000)::numeric * 100
           / NULLIF(rc.area_km2, 0)::numeric, 4
         ), 100
       ) AS pct_cobertura,
       COUNT(DISTINCT (f.capa, f.objectid))::int AS num_titulos
     FROM rural_communities rc
     JOIN forest_titles f ON ST_Intersects(rc.geometry_valid, f.geometry_valid)
     WHERE rc.id IN (${ids})
     GROUP BY rc.id, rc.capa, rc.objectid, rc.nombre, rc.departamento, rc.provincia, rc.distrito, rc.area_km2, rc.geometry_valid
     HAVING ST_Area(ST_Intersection(rc.geometry_valid, ST_Union(f.geometry_valid))::geography) > 0`,
    communityIds
  );

  const rows = result.rows;
  if (rows.length === 0) return 0;

  const tuples = rows.map((r) => [
    r.community_capa, r.community_objectid, r.community_nombre, r.community_departamento,
    r.community_provincia, r.community_distrito, r.community_area_km2,
    r.area_cubierta_km2, r.pct_cobertura, r.num_titulos, batchId,
  ]);

  const { sql, values } = buildInsert("community_forest_coverage", FOREST_COVERAGE_COLUMNS, tuples);
  await client.query(sql, values);
  return rows.length;
}

interface PassStep {
  table: string;
  compute: (client: PoolClient, ids: number[], batchId: number) => Promise<number>;
}

async function runPass(tipo: "minero" | "forestal", steps: readonly PassStep[]): Promise<{ batchId: number; inserted: number[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: communities } = await client.query<{ id: number }>(
      "SELECT id FROM rural_communities WHERE geometry_valid IS NOT NULL ORDER BY id"
    );
    const total = communities.length;
    console.log(`[${tipo}] ${total} comunidades con geometría válida.`);

    const batchRes = await client.query<{ id: string }>(
      "INSERT INTO raw_community_intersection_batches (tipo, record_count) VALUES ($1, 0) RETURNING id",
      [tipo]
    );
    const batchId = Number(batchRes.rows[0].id);

    for (const step of steps) {
      await client.query(`DELETE FROM ${step.table}`);
    }

    const insertedPorStep = steps.map(() => 0);
    for (let i = 0; i < communities.length; i += BATCH_SIZE) {
      const chunk = communities.slice(i, i + BATCH_SIZE).map((c) => c.id);
      for (let s = 0; s < steps.length; s++) {
        insertedPorStep[s] += await steps[s].compute(client, chunk, batchId);
      }
      console.log(`  [${tipo}] [${Math.min(i + BATCH_SIZE, total)}/${total}] ${insertedPorStep.join("/")} filas halladas (por tabla)`);
    }

    await client.query(
      "UPDATE raw_community_intersection_batches SET record_count = $1 WHERE id = $2",
      [insertedPorStep[0] ?? 0, batchId]
    );

    await client.query("COMMIT");
    console.log(`✓ [${tipo}] ${insertedPorStep.join("/")} filas guardadas (por tabla), batch ${batchId}`);
    return { batchId, inserted: insertedPorStep };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function computeCommunityIntersections() {
  const mineroResult = await runPass("minero", [
    { table: "community_mining_intersections", compute: computeMiningBatch },
    { table: "community_mining_coverage", compute: computeMiningCoverageBatch },
  ]);
  const forestalResult = await runPass("forestal", [
    { table: "community_forest_intersections", compute: computeForestBatch },
    { table: "community_forest_coverage", compute: computeForestCoverageBatch },
  ]);
  return {
    minero: { batchId: mineroResult.batchId, pares: mineroResult.inserted[0], comunidades: mineroResult.inserted[1] },
    forestal: { batchId: forestalResult.batchId, pares: forestalResult.inserted[0], comunidades: forestalResult.inserted[1] },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  computeCommunityIntersections()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
