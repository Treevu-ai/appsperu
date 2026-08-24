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

/**
 * A diferencia de `/releases`, `/records` sí trae `compiledRelease.awards`
 * — confirmado en vivo el 2026-08-17. Densidad baja: solo los procesos que
 * ya llegaron a la etapa de adjudicación tienen awards no vacío.
 */
export async function fetchRecordsPage(page: number): Promise<RecordsPageResponse> {
  const qs = new URLSearchParams({ page: String(page), order: "desc" });
  const res = await fetchWithTimeout(`${API_BASE_URL}/records?${qs.toString()}`);
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

async function saveRawBatch(client: PoolClient, pageFrom: number, pageTo: number, records: OcdsRecord[]): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ocds_batches (page_from, page_to, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [pageFrom, pageTo, checksumOf(records), records.length, JSON.stringify(records)]
  );
  return result.rows[0].id;
}

export interface IngestAwardsOptions {
  maxPages?: number;
  departamento?: string;
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
  const { maxPages = DEFAULT_MAX_PAGES, departamento } = options;
  const wantedDepartamento = departamento?.toUpperCase().trim();

  const allRecords: OcdsRecord[] = [];
  let page = 1;
  let pagesFetched = 0;

  for (; pagesFetched < maxPages; pagesFetched++) {
    const { records, links } = await fetchRecordsPage(page);
    allRecords.push(...records);
    if (!links?.next) {
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
    const batchId = await saveRawBatch(client, 1, page, allRecords);

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
      isPartial: true,
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
