import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeDerechos, type CanonicalDerecho, type EsriFeature, type RejectedRow } from "./normalize-ingemmet.js";

const QUERY_ENDPOINT =
  "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0/query";

const OUT_FIELDS = [
  "OBJECTID", "CODIGOU", "FEC_DENU", "CONCESION", "TIT_CONCES", "HECTAGIS",
  "ESTADO", "D_ESTADO", "SUSTANCIA", "DEPA", "PROVI", "DISTRI", "FECHA_ACTUALIZACION",
].join(",");

const INSERT_BATCH_SIZE = 1000;

interface EsriQueryResponse {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

/**
 * Confirmado en vivo 2026-09-21: el servicio declara `supportsPagination: false` y rechaza
 * `resultRecordCount`/`resultOffset` con `HTTP 400 "Pagination is not supported."`. La única vía
 * real de traer más del límite de 1000 filas por respuesta (`maxRecordCount`, confirmado en
 * vivo) es paginar por rango de `OBJECTID` -- se pide sin ese parámetro, ordenado por
 * `OBJECTID ASC`, y se repite con `OBJECTID > último_id` mientras la respuesta declare
 * `exceededTransferLimit: true`. Patrón estándar de ArcGIS REST para este tipo de límite.
 */
async function fetchAllFeatures(): Promise<EsriFeature[]> {
  const all: EsriFeature[] = [];
  let lastObjectId = 0;
  let exceeded = true;

  while (exceeded) {
    const params = new URLSearchParams({
      where: `OBJECTID>${lastObjectId}`,
      outFields: OUT_FIELDS,
      orderByFields: "OBJECTID ASC",
      returnGeometry: "false",
      f: "json",
    });
    const res = await fetch(`${QUERY_ENDPOINT}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`INGEMMET devolvió ${res.status} al consultar OBJECTID>${lastObjectId}`);
    }
    const payload = (await res.json()) as EsriQueryResponse;
    if (payload.error) {
      throw new Error(`INGEMMET devolvió error ${payload.error.code}: ${payload.error.message}`);
    }

    const features = payload.features ?? [];
    if (features.length === 0) break;

    all.push(...features);
    const last = features[features.length - 1]?.attributes.OBJECTID;
    const lastId = typeof last === "number" ? last : lastObjectId;
    if (lastId <= lastObjectId) break; // salvaguarda contra bucle infinito si el servidor no avanza
    lastObjectId = lastId;
    exceeded = payload.exceededTransferLimit === true;
  }

  return all;
}

async function saveRawBatch(client: PoolClient): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ingemmet_batches (source_url, record_count) VALUES ($1, 0) RETURNING id`,
    [QUERY_ENDPOINT]
  );
  return result.rows[0].id;
}

const UPSERT_COLUMNS = [
  "objectid", "codigou", "fecha_denuncio", "concesion", "titular", "hectareas",
  "estado", "estado_descripcion", "sustancia", "departamento", "provincia", "distrito",
  "fecha_actualizacion", "source_batch_id",
] as const;

/**
 * `ON CONFLICT DO UPDATE` no tolera que dos filas del mismo `INSERT` compartan la clave --
 * Postgres aborta con "ON CONFLICT DO UPDATE command cannot affect row a second time" (mismo
 * hallazgo real de Copilot ya corregido en `legislativo-congreso`). No se ha visto un `codigou`
 * duplicado real en la fuente (verificado: 66,823 filas, 66,823 claves únicas), pero el conector
 * no debe asumirlo -- se deduplica antes de armar el `INSERT`, quedándose con la última aparición.
 */
function dedupeByCodigo(rows: readonly CanonicalDerecho[]): CanonicalDerecho[] {
  const byKey = new Map<string, CanonicalDerecho>();
  for (const row of rows) {
    byKey.set(row.codigou, row);
  }
  return [...byKey.values()];
}

async function upsertBatch(client: PoolClient, batchId: number, rowsIn: readonly CanonicalDerecho[]): Promise<void> {
  const rows = dedupeByCodigo(rowsIn);
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * UPSERT_COLUMNS.length;
    tuples.push(`(${UPSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.objectid, row.codigou, row.fechaDenuncio, row.concesion, row.titular, row.hectareas,
      row.estado, row.estadoDescripcion, row.sustancia, row.departamento, row.provincia, row.distrito,
      row.fechaActualizacion, batchId
    );
  });

  await client.query(
    `INSERT INTO catastro_minero_derechos (${UPSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (codigou) DO UPDATE SET
       objectid = EXCLUDED.objectid,
       fecha_denuncio = EXCLUDED.fecha_denuncio,
       concesion = EXCLUDED.concesion,
       titular = EXCLUDED.titular,
       hectareas = EXCLUDED.hectareas,
       estado = EXCLUDED.estado,
       estado_descripcion = EXCLUDED.estado_descripcion,
       sustancia = EXCLUDED.sustancia,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       fecha_actualizacion = EXCLUDED.fecha_actualizacion,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO catastro_minero_derechos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestIngemmet(): Promise<IngestSummary> {
  const features = await fetchAllFeatures();
  const { rows, rejected } = normalizeDerechos(features);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await upsertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    /**
     * Cada corrida trae el catastro completo vigente -- un derecho que ya no aparece (extinguido
     * y removido del servicio, o cualquier otra razón) debe desaparecer de la tabla, no quedarse
     * "vigente" indefinidamente solo porque su fila no fue tocada en esta corrida (mismo
     * hallazgo real de Copilot ya corregido en `legislativo-congreso`). Cualquier fila cuyo
     * `source_batch_id` no sea el de esta corrida no fue re-confirmada -- se elimina, en la
     * misma transacción.
     */
    await client.query("DELETE FROM catastro_minero_derechos WHERE source_batch_id <> $1", [batchId]);

    await client.query("UPDATE raw_ingemmet_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

    await client.query("COMMIT");
    return { batchId, filasOrigen: features.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestIngemmet()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
