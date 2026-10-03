import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { extractCargasRows, findHeaderRow, findLastDataRow, type CargaPortuariaRow, type RejectedRow } from "./cargas-portuarias-parse.js";

// datosabiertos.gob.pe bloquea con un WAF (CloudWAF, HTTP 418) cualquier request sin cabeceras
// de navegador real — confirmado en vivo 2026-10-03. Mismo User-Agent que
// infraestructura-mtc-connector.ts, más un Referer explícito.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const CARGAS_URL = "https://www.datosabiertos.gob.pe/sites/default/files/CARGAS_2010_2017.xlsx";

function checksumOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function saveRawBatch(client: PoolClient, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_infraestructura_mtc_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
    ["cargas_portuarias", sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO cargas_portuarias_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

const CARGAS_COLUMNS = ["nivel", "ambito", "puerto", "nombre_fuente", "uso", "anio", "volumen_tm", "source_batch_id"] as const;

async function insertCargasBatch(client: PoolClient, batchId: number, rows: readonly CargaPortuariaRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * CARGAS_COLUMNS.length;
    tuples.push(`(${CARGAS_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(row.nivel, row.ambito, row.puerto, row.nombreFuente, row.uso, row.anio, row.volumenTm, batchId);
  });

  // El dataset fuente es estático (2010-2017): re-ingestar debe actualizar la fila existente,
  // no duplicarla — mismo patrón que terminales_portuarios/aerodromos/peajes. El conflicto se
  // resuelve contra uq_cargas_portuarias_fuente_puerto_anio (migración 003), que usa
  // COALESCE(puerto, '') porque Postgres no deduplica NULLs en una UNIQUE normal.
  await client.query(
    `INSERT INTO cargas_portuarias_historico (${CARGAS_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (nombre_fuente, COALESCE(puerto, ''), anio) DO UPDATE SET
       nivel = EXCLUDED.nivel, ambito = EXCLUDED.ambito, uso = EXCLUDED.uso,
       volumen_tm = EXCLUDED.volumen_tm, source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

/**
 * El XLSX es un snapshot completo en cada corrida: cualquier fila que ya no aparezca (o que
 * ahora se rechace) debe desaparecer del histórico, no quedarse con su `source_batch_id` viejo
 * para siempre. Mismo patrón que los conectores de snapshot completo de esta app
 * (infraestructura-mtc-connector.ts borra+reinserta vía UPSERT con purga por `fecha_corte`).
 * Hallazgo real de Copilot en PR #232.
 */
async function purgeFilasObsoletas(client: PoolClient, batchId: number): Promise<number> {
  const result = await client.query(`DELETE FROM cargas_portuarias_historico WHERE source_batch_id != $1`, [batchId]);
  return result.rowCount ?? 0;
}

export interface IngestCargasSummary {
  dataset: "cargas_portuarias";
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
  filasPurgadas: number;
}

export async function ingestCargasPortuarias(): Promise<IngestCargasSummary> {
  const res = await fetch(CARGAS_URL, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://www.datosabiertos.gob.pe/dataset/anuario-estadistico-portuario" },
  });
  if (!res.ok) {
    throw new Error(`APN/datosabiertos devolvió ${res.status} al descargar ${CARGAS_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const workbook = new ExcelJS.Workbook();
  // exceljs trae su propia declaración ambiental de `Buffer` que no coincide
  // estructuralmente con la de @types/node instalada aquí — cast atado al tipo real del
  // parámetro (no `as never`) para que un valor incompatible futuro siga fallando el type-check.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("El XLSX de cargas portuarias no tiene ninguna hoja.");
  }

  const headerRowIndex = findHeaderRow(worksheet);
  const lastRowIndex = findLastDataRow(worksheet, headerRowIndex);
  const { rows, rejected, filasFuenteOrigen } = extractCargasRows(worksheet, headerRowIndex, lastRowIndex);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, CARGAS_URL, checksumOf(buffer), filasFuenteOrigen);
    await insertCargasBatch(client, batchId, rows);
    await insertRejectedBatch(client, batchId, rejected);
    const filasPurgadas = await purgeFilasObsoletas(client, batchId);
    await client.query("COMMIT");
    return {
      dataset: "cargas_portuarias",
      batchId,
      filasOrigen: filasFuenteOrigen,
      filasInsertadas: rows.length,
      filasRechazadas: rejected.length,
      filasPurgadas,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestCargasPortuarias()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
