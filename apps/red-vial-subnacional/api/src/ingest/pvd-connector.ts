import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeIntervenciones, type CanonicalIntervencion, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Confirmado en vivo 2026-09-06 con el enlace real que dio el usuario tras navegarlo en un
// browser normal — el fetch automático sobre la página del dataset no lograba renderizar el
// recurso (a diferencia de MINEDU, donde sí se pudo resolver por scraping). Nombre de archivo
// con fecha de corte embebida (`_30062026`) — no confirmado si es 100% predecible entre cortes.
const FILE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/1_Dataset_Intervenciones_PVD_30062026.csv";

const INSERT_BATCH_SIZE = 1000;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_pvd_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [FILE_URL, checksum, recordCount]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "id_intervencion", "codigo_unico_inversion", "jerarquia", "codigo_ruta", "trayectoria",
  "inicio_km", "final_km", "id_departamento", "id_provincia", "departamento", "provincia",
  "estado", "superficie", "convenio", "longitud_km", "responsable", "componente",
  "corredor_vial", "nivel_intervencion", "tramo", "fecha_corte", "row_hash", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalIntervencion[]): Promise<void> {
  if (rows.length === 0) return;

  const byHash = new Map(rows.map((row) => [row.rowHash, row]));
  const deduped = [...byHash.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.idIntervencion, row.codigoUnicoInversion, row.jerarquia, row.codigoRuta, row.trayectoria,
      row.inicioKm, row.finalKm, row.idDepartamento, row.idProvincia, row.departamento, row.provincia,
      row.estado, row.superficie, row.convenio, row.longitudKm, row.responsable, row.componente,
      row.corredorVial, row.nivelIntervencion, row.tramo, row.fechaCorte, row.rowHash, batchId
    );
  });

  await client.query(
    `INSERT INTO intervenciones_viales (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (row_hash) DO UPDATE SET source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO intervenciones_viales_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestPvd(): Promise<IngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MTC/PNDA devolvió ${res.status} al descargar ${FILE_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const csvText = buffer.toString("latin1");

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeIntervenciones(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, checksumOf(csvText), rawRows.length);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query("COMMIT");
    return { batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestPvd()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
