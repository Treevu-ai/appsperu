import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  defaultPeriodRange,
  NATIONAL_TRADE_SERIES,
  normalizeBcrpResponse,
  type BcrpApiResponse,
  type NormalizedTradeRow,
} from "./normalize.js";

const API_BASE = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchNationalTradeSeries(periodStart: string, periodEnd: string): Promise<{
  rawText: string;
  data: BcrpApiResponse;
  seriesCodes: string;
}> {
  const seriesCodes = NATIONAL_TRADE_SERIES.map((s) => s.code).join("-");
  const url = `${API_BASE}/${seriesCodes}/json/${periodStart}/${periodEnd}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`BCRP devolvió ${res.status} al pedir comercio exterior nacional (${url}).`);
  }
  const rawText = await res.text();
  return { rawText, data: JSON.parse(rawText) as BcrpApiResponse, seriesCodes };
}

async function saveRawBatch(
  client: PoolClient,
  seriesCodes: string,
  periodStart: string,
  periodEnd: string,
  rawText: string
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_bcrp_batches (series_codes, period_start, period_end, checksum, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [seriesCodes, periodStart, periodEnd, checksumOf(rawText), rawText]
  );
  return rows[0].id;
}

async function upsertRows(client: PoolClient, batchId: number, rows: NormalizedTradeRow[]): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO trade_indicators
         (series_code, series_key, series_title, category, period_year, period_month, value_usd_millions, source_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (series_code, period_year, period_month) DO UPDATE SET
         series_key = EXCLUDED.series_key,
         series_title = EXCLUDED.series_title,
         category = EXCLUDED.category,
         value_usd_millions = EXCLUDED.value_usd_millions,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        row.seriesCode,
        row.seriesKey,
        row.seriesTitle,
        row.category,
        row.periodYear,
        row.periodMonth,
        row.valueUsdMillions,
        batchId,
      ]
    );
  }
}

export interface IngestSummary {
  batchId: number;
  periodStart: string;
  periodEnd: string;
  rowsInserted: number;
  isPartial: false;
}

export async function ingestNationalTrade(options: {
  periodStart?: string;
  periodEnd?: string;
} = {}): Promise<IngestSummary> {
  const defaults = defaultPeriodRange();
  const periodStart = options.periodStart ?? process.env.BCRP_TRADE_PERIOD_START ?? defaults.start;
  const periodEnd = options.periodEnd ?? process.env.BCRP_TRADE_PERIOD_END ?? defaults.end;

  const { rawText, data, seriesCodes } = await fetchNationalTradeSeries(periodStart, periodEnd);
  const rows = normalizeBcrpResponse(data);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, seriesCodes, periodStart, periodEnd, rawText);
    await upsertRows(client, batchId, rows);
    await client.query("COMMIT");
    return { batchId, periodStart, periodEnd, rowsInserted: rows.length, isPartial: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestNationalTrade()
    .then((summary) => console.log("Ingesta BCRP comercio exterior completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta BCRP falló:", error);
      process.exitCode = 1;
    });
}
