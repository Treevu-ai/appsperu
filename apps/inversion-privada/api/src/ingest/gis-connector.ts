import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parseGisFeature, type GisFeatureCollection, type NormalizedGisFeature } from "./gis-normalize.js";

const GIS_FEATURES_URL = "https://vertix.proinversion.gob.pe/GIS/Dashboard/ListaRegistrosCapas";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * GET simple, sin multipart y sin auth — a diferencia de `vertix-connector.ts`
 * (POST multipart a `vertixService.php`) y `oxi-connector.ts` (POST multipart
 * a `investmentpromotionExport.php`), este endpoint es el que alimenta el
 * dashboard público embebido en `https://www.investinperu.pe/gis-vertix/`
 * (confirmado en vivo 2026-08-28: responde 200 sin redirect a login).
 */
export async function fetchGisFeatureCollection(): Promise<GisFeatureCollection> {
  const res = await fetch(GIS_FEATURES_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`GIS ListaRegistrosCapas devolvió HTTP ${res.status}.`);
  }

  const data = (await res.json()) as GisFeatureCollection;
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("GIS ListaRegistrosCapas respondió un payload inesperado (no es un FeatureCollection).");
  }

  return data;
}

async function saveRawBatch(client: PoolClient, featureCount: number, checksum: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_gis_batches (feature_count, checksum) VALUES ($1, $2) RETURNING id`,
    [featureCount, checksum]
  );
  return rows[0].id;
}

async function upsertGisFeature(client: PoolClient, batchId: number, row: NormalizedGisFeature): Promise<void> {
  await client.query(
    `INSERT INTO vertix_project_geometries (
       codigo, id_proyecto, nombre_proyecto, sector, fase, tipo_proyecto,
       departamentos_inei, tipo_coordenada, geometry, source_batch_id, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (codigo) DO UPDATE SET
       id_proyecto = EXCLUDED.id_proyecto,
       nombre_proyecto = EXCLUDED.nombre_proyecto,
       sector = EXCLUDED.sector,
       fase = EXCLUDED.fase,
       tipo_proyecto = EXCLUDED.tipo_proyecto,
       departamentos_inei = EXCLUDED.departamentos_inei,
       tipo_coordenada = EXCLUDED.tipo_coordenada,
       geometry = EXCLUDED.geometry,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    [
      row.codigo,
      row.idProyecto,
      row.nombreProyecto,
      row.sector,
      row.fase,
      row.tipoProyecto,
      row.departamentosInei,
      row.tipoCoordenada,
      JSON.stringify(row.geometry),
      batchId,
    ]
  );
}

/**
 * Borra las geometrías que no vinieron en el batch actual (su
 * `source_batch_id` sigue apuntando a un batch anterior porque el upsert de
 * este batch no las tocó) — evita que proyectos que desaparecen del feed
 * queden huérfanos en la base para siempre. Snapshot completo por corrida,
 * mismo criterio que `vertix-connector.ts`/`oxi-connector.ts`.
 */
async function deleteStaleGeometries(client: PoolClient, batchId: number): Promise<number> {
  const { rowCount } = await client.query(`DELETE FROM vertix_project_geometries WHERE source_batch_id != $1`, [
    batchId,
  ]);
  return rowCount ?? 0;
}

export interface GisIngestSummary {
  batchId: number;
  featureCount: number;
  rowsUpserted: number;
  rejected: number;
  deletedStale: number;
}

export async function ingestGisFeatures(): Promise<GisIngestSummary> {
  const collection = await fetchGisFeatureCollection();
  const checksum = createHash("sha256").update(JSON.stringify(collection)).digest("hex");

  const normalized = collection.features.map(parseGisFeature).filter((f): f is NormalizedGisFeature => f !== null);
  const rejected = collection.features.length - normalized.length;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, collection.features.length, checksum);
    for (const row of normalized) {
      await upsertGisFeature(client, batchId, row);
    }
    const deletedStale = await deleteStaleGeometries(client, batchId);
    await client.query("COMMIT");

    return {
      batchId,
      featureCount: collection.features.length,
      rowsUpserted: normalized.length,
      rejected,
      deletedStale,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestGisFeatures()
    .then((summary) => console.log("Ingesta GIS VERTIX completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta GIS falló:", error);
      process.exitCode = 1;
    });
}
