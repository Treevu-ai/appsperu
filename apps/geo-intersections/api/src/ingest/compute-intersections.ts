/**
 * compute-intersections.ts — Calcula superposiciones minería ∩ bosque vía PostGIS.
 *
 * ST_Intersects entre mining_rights y forest_titles (ambos Polygon, SRID 4326).
 * Calcula área de intersección y % de solapamiento relativo a cada polígono.
 * Borra resultados anteriores y guarda los nuevos en la misma transacción.
 *
 * Para 66k × 5k combinaciones el brute force es costoso (~330M comparaciones).
 * Estrategia: bounding box pre-filter con ST_Intersects(idx_mining_rights_geom,
 * idx_forest_titles_geom) sobre el índice GIST — solo los pares con bounding
 * boxes que se solapan pasan al cálculo real de ST_Intersects.
 *
 * Uso:
 *   npm run ingest:intersections
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "500");

interface RawIntersection {
  mining_codigou: string;
  mining_concesion: string;
  mining_titular: string;
  mining_estado: string;
  mining_sustancia: string;
  mining_departamento: string;
  mining_area_km2: number;
  forest_capa: string;
  forest_objectid: number;
  forest_fuente: string;
  forest_nom_dep: string;
  forest_area_km2: number;
  intersection_geom: string; // ST_AsGeoJSON
  intersection_area_km2: number;
  mining_overlap_pct: number;
  forest_overlap_pct: number;
}

async function computeBatch(
  client: PoolClient,
  miningIds: number[],
  batchId: number
): Promise<number> {
  const ids = miningIds.map((id, i) => `$${i + 1}`).join(",");

  // La query con bounding-box pre-filter:
  // 1. JOIN sobre los índices GIST (idx busca pares con bbox solapado)
  // 2. ST_Intersects real filtra los que de verdad se solapan
  // 3. ST_Area del overlap en km²
  // 4. ST_AsGeoJSON para guardar la geometría
  const result = await client.query<RawIntersection>(
    `SELECT
       m.codigou        AS mining_codigou,
       m.concesion      AS mining_concesion,
       m.titular        AS mining_titular,
       m.estado         AS mining_estado,
       m.sustancia      AS mining_sustancia,
       m.departamento   AS mining_departamento,
       m.area_km2       AS mining_area_km2,
       f.capa           AS forest_capa,
       f.objectid       AS forest_objectid,
       f.fuente         AS forest_fuente,
       f.nom_dep        AS forest_nom_dep,
       f.area_km2       AS forest_area_km2,
       -- geometry_valid: pre-repaired via ST_MakeValid (migración 004), evita TopologyException
       ST_AsGeoJSON(ST_Intersection(m.geometry_valid, f.geometry_valid)::geometry) AS intersection_geom,
       (ST_Area(ST_Intersection(m.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric AS intersection_area_km2,
       ROUND(
         (ST_Area(ST_Intersection(m.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(m.area_km2, 0)::numeric, 4
       ) AS mining_overlap_pct,
       ROUND(
         (ST_Area(ST_Intersection(m.geometry_valid, f.geometry_valid)::geography) / 1_000_000)::numeric * 100
         / NULLIF(f.area_km2, 0)::numeric, 4
       ) AS forest_overlap_pct
     FROM mining_rights m
     JOIN forest_titles f ON ST_Intersects(m.geometry_valid, f.geometry_valid)
     WHERE m.id IN (${ids})`,
    miningIds
  );

  const rows = result.rows;
  if (rows.length === 0) return 0;

  const values: unknown[] = [];
  const tuples: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const base = i * 17;
    tuples.push(
      `(${Array.from({ length: 17 }, (_, j) => `$${base + j + 1}`).join(",")})`
    );
    values.push(
      r.mining_codigou, r.mining_concesion, r.mining_titular,
      r.mining_estado, r.mining_sustancia, r.mining_departamento,
      r.mining_area_km2,
      r.forest_capa, r.forest_objectid, r.forest_fuente,
      r.forest_nom_dep, r.forest_area_km2,
      r.intersection_geom, r.intersection_area_km2,
      r.mining_overlap_pct, r.forest_overlap_pct,
      batchId  // $17 — batch_id
    );
  }

  await client.query(
    `INSERT INTO intersection_results
       (mining_codigou, mining_concesion, mining_titular,
        mining_estado, mining_sustancia, mining_departamento, mining_area_km2,
        forest_capa, forest_objectid, forest_fuente, forest_nom_dep, forest_area_km2,
        intersection_geom, intersection_area_km2,
        mining_overlap_pct, forest_overlap_pct, batch_id)
     VALUES ${tuples.join(",")}`,
    values
  );

  return rows.length;
}

async function main() {
  console.log("=== compute-intersections ===");
  console.log(`Batch size: ${BATCH_SIZE}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener IDs de todos los derechos mineros con geometría
    const { rows: rights } = await client.query<{ id: number }>(
      `SELECT id FROM mining_rights WHERE geometry IS NOT NULL ORDER BY id`
    );
    const total = rights.length;
    console.log(`${total} derechos mineros con geometría.`);

    // Batch ID para tracking
    const batchRes = await client.query<{ id: number }>(
      `INSERT INTO raw_intersection_batches (record_count) VALUES (0) RETURNING id`
    );
    const batchId = Number(batchRes.rows[0].id);
    let inserted = 0;

    // Procesar en chunks
    const resumeAfter = Number(
      process.argv.find((a) => a.startsWith("--resume-after="))?.split("=")[1] ?? "0"
    );
    if (resumeAfter > 0) {
      console.log(`Reanudando desde derecho id > ${resumeAfter}`);
    }
    for (let i = 0; i < rights.length; i += BATCH_SIZE) {
      const chunk = rights.slice(i, i + BATCH_SIZE).map((r) => r.id);
      if (chunk[0] < resumeAfter) continue;
      const n = await computeBatch(client, chunk, batchId);
      inserted += n;
      const pct = Math.round((i / total) * 100);
      console.log(`  [${Math.min(i + BATCH_SIZE, total)}/${total}] ${inserted} intersecciones halladas`);
    }

    // Actualizar conteo del batch
    await client.query(
      `UPDATE raw_intersection_batches SET record_count = $1 WHERE id = $2`,
      [inserted, batchId]
    );

    await client.query("COMMIT");
    console.log(`\n✓ ${inserted} intersecciones guardadas, batch ${batchId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en compute-intersections:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
