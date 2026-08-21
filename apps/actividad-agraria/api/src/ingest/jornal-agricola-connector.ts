import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { isRejected, normalizeRow, type NormalizedWageRow, type RawWageRow } from "./normalize.js";

const RESOURCE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/Valor%20de%20Jornal.xlsx%20-%20C.102_0.csv";
const RESOURCE_ID = "midagri-03.03-valor-de-jornal-agricola-por-region";

// El portal está detrás de un WAF que bloquea requests sin headers de
// navegador (confirmado en vivo 2026-08-21 — un fetch sin User-Agent
// devuelve una página de bloqueo en chino en vez del CSV, ver
// docs/data-contracts/midagri-estadistica-agraria.md y ADR-0008).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function fetchJornalCsv(): Promise<string> {
  const res = await fetch(RESOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MIDAGRI/PNDA devolvió ${res.status} al descargar el CSV de jornal agrícola.`);
  }
  return res.text();
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * El CSV usa `;` como separador (no `,`) y trae BOM UTF-8 — confirmado en
 * vivo contra el archivo real, no solo la previsualización del portal (ver
 * ADR-0008). `csv-parse` con `bom: true` descarta el BOM automáticamente.
 * Cada fila trae una columna extra vacía al final (artefacto del export de
 * Excel) — `columns: true` la ignora si no tiene encabezado.
 */
function parseRawRows(csvText: string): RawWageRow[] {
  return parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawWageRow[];
}

async function saveRawBatch(client: PoolClient, csvText: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_midagri_batches (resource_id, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [RESOURCE_ID, checksumOf(csvText), recordCount, JSON.stringify({ csv: csvText })]
  );
  return result.rows[0].id;
}

const WAGE_COLUMNS = ["departamento", "anio", "mes", "valor_soles", "source_batch_id"] as const;

async function insertWageRows(client: PoolClient, batchId: number, rows: NormalizedWageRow[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * WAGE_COLUMNS.length;
    tuples.push(`(${WAGE_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(row.departamento, row.anio, row.mes, row.valorSoles, batchId);
  });

  await client.query(
    `INSERT INTO agricultural_wage (${WAGE_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (departamento, anio, mes) DO UPDATE SET
       valor_soles = EXCLUDED.valor_soles,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejected(client: PoolClient, batchId: number, raw: RawWageRow, reason: string): Promise<void> {
  await client.query(
    `INSERT INTO agricultural_wage_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
    [batchId, JSON.stringify(raw), reason]
  );
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasAceptadas: number;
  filasRechazadas: number;
  valoresMensualesInsertados: number;
}

export async function ingestJornalAgricola(): Promise<IngestSummary> {
  const csvText = await fetchJornalCsv();
  const rawRows = parseRawRows(csvText);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, csvText, rawRows.length);

    let filasAceptadas = 0;
    let filasRechazadas = 0;
    let valoresMensualesInsertados = 0;

    for (const raw of rawRows) {
      if (isRejected(raw)) {
        await insertRejected(client, batchId, raw, "Región o Año inválido/ausente");
        filasRechazadas += 1;
        continue;
      }

      const normalized = normalizeRow(raw);
      await insertWageRows(client, batchId, normalized);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestJornalAgricola()
    .then((summary) => {
      console.log("Ingesta de actividad agraria (MIDAGRI) completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
