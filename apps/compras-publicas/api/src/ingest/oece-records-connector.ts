import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { findBuyerDepartamento, normalizeAwards, type OcdsRecord } from "./normalize-awards.js";
import { normalizeBidders, persistBidders } from "./normalize-bidders.js";

const API_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";
const DEFAULT_MAX_PAGES = 10;

interface RecordsPageResponse {
  records: OcdsRecord[];
  links?: { next?: string | null; prev?: string | null };
}

export interface FetchRecordsParams {
  startDate?: string;
  endDate?: string;
  mainProcurementCategory?: string;
}

/**
 * A diferencia de `/releases`, `/records` sí trae `compiledRelease.awards`
 * — confirmado en vivo el 2026-08-17. Densidad baja: solo los procesos que
 * ya llegaron a la etapa de adjudicación tienen awards no vacío.
 */
export function recordsPageUrl(page: number, params: FetchRecordsParams = {}): string {
  const qs = new URLSearchParams({ page: String(page), order: "desc" });
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.mainProcurementCategory) qs.set("mainProcurementCategory", params.mainProcurementCategory);
  return `${API_BASE_URL}/records?${qs.toString()}`;
}

export async function fetchRecordsPage(page: number, params: FetchRecordsParams = {}): Promise<RecordsPageResponse> {
  const res = await fetchWithTimeout(recordsPageUrl(page, params));
  if (!res.ok) {
    throw new Error(`OECE devolvió ${res.status} para la página ${page} de /records`);
  }
  return (await res.json()) as RecordsPageResponse;
}

function checksumOf(records: unknown): string {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function filterRecordsByDepartment(records: OcdsRecord[], departamento?: string): OcdsRecord[] {
  const wanted = departamento?.toUpperCase().trim();
  if (!wanted) return records;
  return records.filter((record) => findBuyerDepartamento(record)?.toUpperCase().trim() === wanted);
}

async function saveRawBatch(client: PoolClient, pageFrom: number, pageTo: number, records: OcdsRecord[], params: FetchRecordsParams): Promise<number> {
  const sourceUrl = recordsPageUrl(pageFrom, params);
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ocds_batches (page_from, page_to, checksum, record_count, payload, source_endpoint, source_url, query_params)
     VALUES ($1, $2, $3, $4, $5, '/records', $6, $7::jsonb)
     RETURNING id`,
    [pageFrom, pageTo, checksumOf(records), records.length, JSON.stringify(records), sourceUrl, JSON.stringify(params)]
  );
  return result.rows[0].id;
}

export interface IngestAwardsOptions {
  maxPages?: number;
  startPage?: number;
  departamento?: string;
  params?: FetchRecordsParams;
}

export interface IngestAwardsSummary {
  batchId: number;
  pagesFetched: number;
  totalFetched: number;
  recordsWithAwards: number;
  accepted: number;
  skippedOtherDepartamento: number;
  rejected: number;
  isPartial: boolean;
  biddersInserted?: number;
  biddersFailed?: number;
  biddersRejected?: number;
  biddersSkippedOtherDepartamento?: number;
}

/**
 * Recorre páginas de `/records` (acotado por `maxPages`), extrae awards +
 * proveedores + postores, filtra por departamento del comprador, guarda el lote crudo
 * y hace upsert por (ocid, award_id, supplier_id) en awards y (ocid, bidder_id) en bidders.
 */
export async function ingestAwards(options: IngestAwardsOptions = {}): Promise<IngestAwardsSummary> {
  const { maxPages = DEFAULT_MAX_PAGES, startPage = 1, departamento, params = {} } = options;
  if (!Number.isInteger(maxPages) || maxPages < 0) throw new Error("maxPages debe ser entero >= 0; 0 recorre toda la ventana solicitada.");
  if (!Number.isInteger(startPage) || startPage < 1) throw new Error("startPage debe ser un entero >= 1.");
  const wantedDepartamento = departamento?.toUpperCase().trim();

  const allRecords: OcdsRecord[] = [];
  let page = startPage;
  let pagesFetched = 0;
  let hasNext = false;

  for (; maxPages === 0 || pagesFetched < maxPages; pagesFetched++) {
    const { records, links } = await fetchRecordsPage(page, params);
    allRecords.push(...records);
    hasNext = Boolean(links?.next);
    if (!hasNext) {
      pagesFetched += 1;
      break;
    }
    page += 1;
  }

  const recordsWithAwards = allRecords.filter(
    (r) => r.compiledRelease?.awards && r.compiledRelease.awards.length > 0
  ).length;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, startPage, page - (hasNext ? 1 : 0), allRecords, params);

    // Procesar awards
    const { rows: allRows, rejected } = normalizeAwards(allRecords);
    const rows = wantedDepartamento
      ? allRows.filter((r) => r.departamento?.toUpperCase().trim() === wantedDepartamento)
      : allRows;
    const skippedOtherDepartamento = allRows.length - rows.length;

    for (const row of rows) {
      await client.query(
        `INSERT INTO awards
           (ocid, award_id, buyer_id, buyer_name, departamento, supplier_id, supplier_name,
            valor_monto, valor_moneda, fecha, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (ocid, award_id, supplier_id) DO UPDATE
           SET valor_monto = EXCLUDED.valor_monto,
               valor_moneda = EXCLUDED.valor_moneda,
               source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.ocid,
          row.awardId,
          row.buyerId,
          row.buyerName,
          row.departamento,
          row.supplierId,
          row.supplierName,
          row.valorMonto,
          row.valorMoneda,
          row.fecha,
          batchId,
        ]
      );
    }

    for (const bad of rejected) {
      await client.query(
        `INSERT INTO awards_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    // Los postores deben tener exactamente el mismo alcance territorial que
    // las adjudicaciones; no se mezcla el resto de las páginas nacionales.
    const bidderRecords = filterRecordsByDepartment(allRecords, wantedDepartamento);
    const { rows: biddersRows, rejected: biddersRejected } = normalizeBidders(bidderRecords);
    const { inserted: biddersInserted, failed: biddersFailed } = await persistBidders(client, biddersRows, batchId);

    for (const bad of biddersRejected) {
      await client.query(
        `INSERT INTO bidders_rejected (source_batch_id, raw_bidder_data, reason) VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    await client.query("COMMIT");

    return {
      batchId,
      pagesFetched,
      totalFetched: allRecords.length,
      recordsWithAwards,
      accepted: rows.length,
      skippedOtherDepartamento,
      rejected: rejected.length,
      isPartial: hasNext,
      biddersInserted,
      biddersFailed,
      biddersRejected: biddersRejected.length,
      biddersSkippedOtherDepartamento: allRecords.length - bidderRecords.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const maxPages = process.env.OECE_MAX_PAGES ? Number(process.env.OECE_MAX_PAGES) : undefined;
  const departamento = process.env.OECE_DEPARTAMENTO;

  ingestAwards({ maxPages, departamento })
    .then((summary) => {
      console.log("Ingesta de adjudicaciones y bidders completada:", summary);
      console.warn(
        "AVISO: esta es una ingesta PARCIAL (páginas recientes acotadas por maxPages). " +
          "No cubre el universo nacional de adjudicaciones."
      );
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
