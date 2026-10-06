/**
 * replicate-territories.ts — Replica ceplan_geo.territories y usa el resultado para
 * completar `rural_communities.distrito`/`provincia` donde la fuente SERFOR OCAPAS no los trae.
 *
 * Por qué una réplica local y no un cruce cross-base en vivo (como
 * catastro-forestal/src/db/external-pools.ts): ese patrón traduce UBIGEO → nombre con un join
 * de texto liviano. Esto necesita comparar geometrías (ST_Intersects), y PostGIS no puede
 * comparar geometry entre dos bases Postgres distintas en una sola consulta SQL — hace falta
 * una copia local real.
 *
 * Verificado en vivo 2026-10-06 (exploración con ROLLBACK antes de construir esto): el 100% de
 * las 2,337 comunidades_campesinas + 9 comunidades_nativas sin distrito matchean contra los
 * 1,874 distritos reales de ceplan_geo vía ST_Intersects + mayor área de solapamiento.
 *
 * Uso:
 *   CEPLAN_GEO_DATABASE_URL=postgresql://... npm run ingest:territories
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Client, type PoolClient } from "pg";
import { pool } from "../db/pool.js";

const CEPLAN_GEO_DATABASE_URL = process.env.CEPLAN_GEO_DATABASE_URL;
const INSERT_BATCH_SIZE = 200;

interface RawTerritory {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geojson: string;
}

async function fetchTerritories(): Promise<RawTerritory[]> {
  if (!CEPLAN_GEO_DATABASE_URL) {
    throw new Error(
      "CEPLAN_GEO_DATABASE_URL no configurada -- requerida para replicar territories de ceplan-geo"
    );
  }

  const client = new Client({ connectionString: CEPLAN_GEO_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<RawTerritory>(
      `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(ST_Multi(geometry)) AS geojson
       FROM territories`
    );
    return rows;
  } finally {
    await client.end();
  }
}

async function insertBatch(client: PoolClient, batchId: number, rows: readonly RawTerritory[]): Promise<void> {
  if (rows.length === 0) return;

  const columns = ["ubigeo", "departamento", "provincia", "distrito", "geometry", "source_batch_id"] as const;
  const values: unknown[] = [];
  const tuples: string[] = [];

  rows.forEach((r, i) => {
    const base = i * columns.length;
    tuples.push(
      `(${columns.map((col, j) => {
        const placeholder = `$${base + j + 1}`;
        return col === "geometry" ? `ST_GeomFromGeoJSON(${placeholder})` : placeholder;
      }).join(",")})`
    );
    values.push(r.ubigeo, r.departamento, r.provincia, r.distrito, r.geojson, batchId);
  });

  await client.query(
    `INSERT INTO territories (${columns.join(",")}) VALUES ${tuples.join(",")}`,
    values
  );
}

export interface ReplicateSummary {
  batchId: number;
  inserted: number;
}

async function replicateTerritories(): Promise<ReplicateSummary> {
  const territories = await fetchTerritories();
  console.log(`${territories.length} territorios descargados de ceplan-geo.`);

  // 0 filas sería sospechoso (la fuente nunca ha estado vacía) -- mismo criterio de
  // protección que ocapas-connector.ts: aborta antes de reemplazar un snapshot poblado.
  if (territories.length === 0) {
    throw new Error("ceplan_geo.territories devolvió 0 filas -- se aborta para no vaciar la réplica local");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('territories_replicate'))");

    const batchRes = await client.query<{ id: string }>(
      "INSERT INTO raw_territories_batches (source_url, record_count) VALUES ($1, 0) RETURNING id",
      ["ceplan_geo.territories"]
    );
    const batchId = Number(batchRes.rows[0].id);

    await client.query("DELETE FROM territories");

    for (let i = 0; i < territories.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, territories.slice(i, i + INSERT_BATCH_SIZE));
    }

    // ST_MakeValid una sola vez -- mismo patrón que mining_rights/forest_titles/rural_communities.
    await client.query(
      "UPDATE territories SET geometry_valid = ST_MakeValid(geometry) WHERE source_batch_id = $1",
      [batchId]
    );

    await client.query(
      "UPDATE raw_territories_batches SET record_count = $1 WHERE id = $2",
      [territories.length, batchId]
    );

    await client.query("COMMIT");
    console.log(`✓ ${territories.length} territorios replicados, batch ${batchId}`);
    return { batchId, inserted: territories.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Completa distrito/provincia donde la fuente SERFOR OCAPAS no los trae, usando el territorio
 * con mayor área de solapamiento REAL (no el primero que matchee) -- una comunidad puede
 * tocar más de un distrito en sus bordes. Nunca pisa un valor ya existente
 * (`WHERE rc.distrito IS NULL` / `COALESCE(rc.provincia, ...)`), así que es seguro re-correr.
 *
 * Dos guardas agregadas tras revisión real (CodeRabbit/Copilot, PR #246):
 * - `ST_Area(ST_Intersection(...)) > 0`: `ST_Intersects` también es verdadero cuando dos
 *   polígonos solo se tocan en un borde o un punto (área cero) -- sin este filtro, una
 *   comunidad podía quedar asignada a un distrito con el que apenas comparte un borde, y
 *   `WHERE rc.distrito IS NULL` impedía corregirlo en una corrida posterior.
 * - `t.distrito IS NOT NULL`: si el mejor match por área fuera un territorio sin distrito
 *   poblado, el UPDATE igual contaría la fila como "actualizada" sin dejarle un distrito real.
 *
 * Exportada (no solo de uso interno): `ocapas-connector.ts` la reutiliza después de cada
 * re-ingesta de comunidades -- ver el comentario en `ingestOcapas()` sobre por qué un DELETE +
 * reinsert de capa borraría este backfill si no se reaplicara automáticamente.
 */
export async function backfillDistrito(client: PoolClient): Promise<number> {
  const result = await client.query(`
    WITH candidatos AS (
      SELECT rc.id, t.distrito, t.provincia,
        ST_Area(ST_Intersection(rc.geometry_valid, t.geometry_valid)::geography) AS overlap_m2
      FROM rural_communities rc
      JOIN territories t ON ST_Intersects(rc.geometry_valid, t.geometry_valid)
      WHERE rc.distrito IS NULL
        AND t.distrito IS NOT NULL
        AND rc.geometry_valid IS NOT NULL
        AND t.geometry_valid IS NOT NULL
    ),
    mejor_match AS (
      SELECT DISTINCT ON (id) id, distrito, provincia
      FROM candidatos
      WHERE overlap_m2 > 0
      ORDER BY id, overlap_m2 DESC
    )
    UPDATE rural_communities rc
    SET distrito = m.distrito,
        provincia = COALESCE(rc.provincia, m.provincia)
    FROM mejor_match m
    WHERE rc.id = m.id
  `);
  return result.rowCount ?? 0;
}

export interface ReplicateAndBackfillSummary extends ReplicateSummary {
  comunidadesActualizadas: number;
}

export async function replicateAndBackfillTerritories(): Promise<ReplicateAndBackfillSummary> {
  const replicateResult = await replicateTerritories();

  const client = await pool.connect();
  let comunidadesActualizadas = 0;
  try {
    await client.query("BEGIN");
    comunidadesActualizadas = await backfillDistrito(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(`✓ ${comunidadesActualizadas} comunidades actualizadas con distrito/provincia real.`);
  return { ...replicateResult, comunidadesActualizadas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  replicateAndBackfillTerritories()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
