import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  isRejectedRegionalRow,
  normalizeRegionalMonthlyRow,
  type NormalizedRegionalMonthlyRow,
  type RawRegionalMonthlyRow,
} from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type RegionalMonthlyDatasetConfig = {
  resourceId: string;
  resourceUrl: string;
  tableName: "agricultural_wage" | "agricultural_tractor_rental" | "agricultural_yunta_rental";
  rejectedTableName:
    | "agricultural_wage_rejected"
    | "agricultural_tractor_rental_rejected"
    | "agricultural_yunta_rental_rejected";
};

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasAceptadas: number;
  filasRechazadas: number;
  valoresMensualesInsertados: number;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MIDAGRI/PNDA devolvió ${res.status} al descargar ${url}`);
  }
  return res.text();
}

function parseRawRows(csvText: string): RawRegionalMonthlyRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRegionalMonthlyRow[];
}

async function saveRawBatch(
  client: PoolClient,
  resourceId: string,
  csvText: string,
  recordCount: number
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_midagri_batches (resource_id, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [resourceId, checksumOf(csvText), recordCount, JSON.stringify({ csv: csvText })]
  );
  return result.rows[0].id;
}

const VALUE_COLUMNS = ["departamento", "anio", "mes", "valor_soles", "source_batch_id"] as const;

async function insertRows(
  client: PoolClient,
  tableName: RegionalMonthlyDatasetConfig["tableName"],
  batchId: number,
  rows: NormalizedRegionalMonthlyRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * VALUE_COLUMNS.length;
    tuples.push(`(${VALUE_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(row.departamento, row.anio, row.mes, row.valorSoles, batchId);
  });

  await client.query(
    `INSERT INTO ${tableName} (${VALUE_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (departamento, anio, mes) DO UPDATE SET
       valor_soles = EXCLUDED.valor_soles,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejected(
  client: PoolClient,
  rejectedTableName: RegionalMonthlyDatasetConfig["rejectedTableName"],
  batchId: number,
  raw: RawRegionalMonthlyRow,
  reason: string
): Promise<void> {
  await client.query(
    `INSERT INTO ${rejectedTableName} (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
    [batchId, JSON.stringify(raw), reason]
  );
}

export async function ingestRegionalMonthlyDataset(
  config: RegionalMonthlyDatasetConfig
): Promise<IngestSummary> {
  const csvText = await fetchCsv(config.resourceUrl);
  const rawRows = parseRawRows(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, config.resourceId, csvText, rawRows.length);

    let filasAceptadas = 0;
    let filasRechazadas = 0;
    let valoresMensualesInsertados = 0;

    for (const raw of rawRows) {
      if (isRejectedRegionalRow(raw)) {
        await insertRejected(client, config.rejectedTableName, batchId, raw, "Región o Año inválido/ausente");
        filasRechazadas += 1;
        continue;
      }

      const normalized = normalizeRegionalMonthlyRow(raw);
      await insertRows(client, config.tableName, batchId, normalized);
      filasAceptadas += 1;
      valoresMensualesInsertados += normalized.length;
    }

    await client.query("COMMIT");
    return { batchId, filasOrigen: rawRows.length, filasAceptadas, filasRechazadas, valoresMensualesInsertados };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
