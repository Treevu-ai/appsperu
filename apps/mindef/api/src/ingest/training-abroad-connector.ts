import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeTrainingAbroad, type CanonicalTrainingAbroad, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * El dataset se lista como "csv" en el catálogo de datosabiertos.gob.pe,
 * pero el recurso real es un .xlsx — confirmado en vivo 2026-09-06.
 */
const FILE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/Dataset_Consolidado%20del%20Personal%20Militar%20capacitado%20en%20el%20Exterior.xlsx";

const HEADER_ROW = 2;

function worksheetToRows(worksheet: ExcelJS.Worksheet, headerRow: number): Record<string, unknown>[] {
  const headers: string[] = [];
  worksheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  const lastRow = worksheet.rowCount;
  for (let r = headerRow + 1; r <= lastRow; r += 1) {
    const row = worksheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      obj[key] = cell.value;
      hasAnyValue = true;
    });
    if (hasAnyValue) rows.push(obj);
  }
  return rows;
}

function checksumOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function saveRawBatch(client: PoolClient, buffer: Buffer, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_mindef_batches (dataset, source_url, checksum, record_count, payload)
     VALUES ('training_abroad', $1, $2, $3, $4)
     RETURNING id`,
    [FILE_URL, checksumOf(buffer), recordCount, JSON.stringify({ note: "XLSX binario, no se re-serializa el contenido crudo aquí" })]
  );
  return result.rows[0].id;
}

async function persistRows(client: PoolClient, rows: readonly CanonicalTrainingAbroad[], batchId: number): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO training_abroad
         (institucion, capacitacion, personal_cantidad, fecha_inicio, fecha_termino, pais, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (institucion, capacitacion, fecha_inicio, pais) DO UPDATE SET
         personal_cantidad = EXCLUDED.personal_cantidad,
         fecha_termino = EXCLUDED.fecha_termino,
         source_batch_id = EXCLUDED.source_batch_id`,
      [row.institucion, row.capacitacion, row.personalCantidad, row.fechaInicio, row.fechaTermino, row.pais, batchId]
    );
  }
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO training_abroad_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface TrainingAbroadIngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestTrainingAbroad(): Promise<TrainingAbroadIngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MINDEF devolvió ${res.status} al descargar ${FILE_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("El archivo de personal capacitado en el exterior no tiene ninguna hoja.");
  }

  const rawRows = worksheetToRows(worksheet, HEADER_ROW);
  const { rows, rejected } = normalizeTrainingAbroad(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, buffer, rawRows.length);
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
  ingestTrainingAbroad()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
