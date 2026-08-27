import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { isRejected, normalizeRow, type NormalizedPoliceReport, type RawPoliceReportRow } from "./normalize.js";

const RESOURCE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/DATASET_Denuncias_Policiales_Ene%202018%20a%20Julio%202026.csv";
const RESOURCE_ID = "mininter-sidpol-denuncias-policiales";

// El portal está detrás de un WAF (CloudWAF, chino) que bloquea requests sin
// headers de navegador — confirmado en vivo el 2026-08-27: un fetch sin
// User-Agent devuelve una página de bloqueo (HTTP 418, "您的请求疑似攻击行为")
// en vez del CSV. Mismo patrón que actividad-agraria/jornal-agricola-connector.ts.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const INSERT_BATCH_SIZE = 1000;

async function fetchSidpolCsv(): Promise<string> {
  const res = await fetch(RESOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MININTER/datosabiertos devolvió ${res.status} al descargar el CSV de denuncias policiales.`);
  }
  return res.text();
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * CSV con comas, comillas dobles y encabezado normal (confirmado en vivo el
 * 2026-08-27, a diferencia del CSV de MIDAGRI que usa ";"). `columns: true`
 * usa la primera fila como nombres de campo.
 */
function parseRawRows(csvText: string): RawPoliceReportRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ",",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawPoliceReportRow[];
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_sidpol_batches (resource_id, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [RESOURCE_ID, checksum, recordCount]
  );
  return result.rows[0].id;
}

const REPORT_COLUMNS = ["anio", "mes", "departamento", "provincia", "distrito", "ubigeo", "modalidad", "cantidad", "source_batch_id"] as const;

/**
 * Postgres rechaza un `ON CONFLICT DO UPDATE` que afecte la misma fila dos
 * veces dentro del mismo statement — el CSV de origen trae algunas filas
 * repetidas por (anio, mes, ubigeo, modalidad) (confirmado en vivo, mismo
 * problema que el padrón RUC de SUNAT). Se deduplica dentro del lote antes
 * de construir el VALUES, quedándose con la última ocurrencia.
 */
function dedupeByKey(rows: NormalizedPoliceReport[]): NormalizedPoliceReport[] {
  const byKey = new Map(rows.map((row) => [`${row.anio}|${row.mes}|${row.ubigeo}|${row.modalidad}`, row]));
  return [...byKey.values()];
}

async function insertBatch(client: PoolClient, batchId: number, rowsIn: NormalizedPoliceReport[]): Promise<void> {
  if (rowsIn.length === 0) return;
  const rows = dedupeByKey(rowsIn);

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * REPORT_COLUMNS.length;
    tuples.push(`(${REPORT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(row.anio, row.mes, row.departamento, row.provincia, row.distrito, row.ubigeo, row.modalidad, row.cantidad, batchId);
  });

  await client.query(
    `INSERT INTO police_reports (${REPORT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (anio, mes, ubigeo, modalidad) DO UPDATE SET
       cantidad = EXCLUDED.cantidad,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(
  client: PoolClient,
  batchId: number,
  rejected: { raw: RawPoliceReportRow; reason: string }[]
): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO police_reports_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasAceptadas: number;
  filasRechazadas: number;
}

export async function ingestSidpol(): Promise<IngestSummary> {
  const csvText = await fetchSidpolCsv();
  const rawRows = parseRawRows(csvText);
  const checksum = checksumOf(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, checksum, rawRows.length);

    let acceptBuffer: NormalizedPoliceReport[] = [];
    let rejectBuffer: { raw: RawPoliceReportRow; reason: string }[] = [];
    let filasAceptadas = 0;
    let filasRechazadas = 0;

    for (const raw of rawRows) {
      if (isRejected(raw)) {
        rejectBuffer.push({ raw, reason: "campo requerido ausente/inválido o UBIGEO_HECHO no reconocible" });
        filasRechazadas += 1;
      } else {
        acceptBuffer.push(normalizeRow(raw));
        filasAceptadas += 1;
      }

      if (acceptBuffer.length >= INSERT_BATCH_SIZE) {
        await insertBatch(client, batchId, acceptBuffer);
        acceptBuffer = [];
      }
      if (rejectBuffer.length >= INSERT_BATCH_SIZE) {
        await insertRejectedBatch(client, batchId, rejectBuffer);
        rejectBuffer = [];
      }
    }

    await insertBatch(client, batchId, acceptBuffer);
    await insertRejectedBatch(client, batchId, rejectBuffer);

    await client.query("COMMIT");
    return { batchId, filasOrigen: rawRows.length, filasAceptadas, filasRechazadas };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSidpol()
    .then((summary) => {
      console.log("Ingesta SIDPOL (denuncias policiales) completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
