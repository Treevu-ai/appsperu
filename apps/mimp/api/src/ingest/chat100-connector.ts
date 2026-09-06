import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeChat100Consultas, type CanonicalChat100Consulta, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FILE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/2.9.1%20BdD_Chat100_3.csv";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, csvText: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_mimp_batches (dataset, source_url, checksum, record_count, payload)
     VALUES ('chat100_consultas', $1, $2, $3, $4)
     RETURNING id`,
    [FILE_URL, checksumOf(csvText), recordCount, JSON.stringify({ csv: csvText })]
  );
  return result.rows[0].id;
}

async function persistRows(client: PoolClient, rows: readonly CanonicalChat100Consulta[], batchId: number): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO chat100_consultas
         (anio_reporte, periodo, consultas_total, consultas_hombres, consultas_mujeres, consultas_no_especifica_sexo, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (anio_reporte) DO UPDATE SET
         consultas_total = EXCLUDED.consultas_total,
         consultas_hombres = EXCLUDED.consultas_hombres,
         consultas_mujeres = EXCLUDED.consultas_mujeres,
         consultas_no_especifica_sexo = EXCLUDED.consultas_no_especifica_sexo,
         source_batch_id = EXCLUDED.source_batch_id`,
      [row.anioReporte, row.periodo, row.consultasTotal, row.consultasHombres, row.consultasMujeres, row.consultasNoEspecificaSexo, batchId]
    );
  }
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO chat100_consultas_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface Chat100IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestChat100Consultas(): Promise<Chat100IngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MIMP devolvió ${res.status} al descargar ${FILE_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const csvText = buffer.toString("latin1");

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ";",
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeChat100Consultas(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, csvText, rawRows.length);
    await persistRows(client, rows, batchId);
    await persistRejected(client, rejected, batchId);
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
  ingestChat100Consultas()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
