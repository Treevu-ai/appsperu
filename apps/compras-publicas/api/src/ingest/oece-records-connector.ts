import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { OecePageNotFoundError, normalizeDepartamentoScope } from "./oece-connector.js";
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
  dataSegmentationID?: string;
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
  if (params.dataSegmentationID) qs.set("dataSegmentationID", params.dataSegmentationID);
  if (params.mainProcurementCategory) qs.set("mainProcurementCategory", params.mainProcurementCategory);
  return `${API_BASE_URL}/records?${qs.toString()}`;
}

export async function fetchRecordsPage(page: number, params: FetchRecordsParams = {}): Promise<RecordsPageResponse> {
  const res = await fetchWithTimeout(recordsPageUrl(page, params));
  if (res.status === 404) {
    throw new OecePageNotFoundError(page, "/records");
  }
  if (!res.ok) {
    throw new Error(`OECE devolvió ${res.status} para la página ${page} de /records`);
  }
  return (await res.json()) as RecordsPageResponse;
}

function checksumOf(records: unknown): string {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function filterRecordsByDepartment(records: OcdsRecord[], departamento?: string, departamentos?: readonly string[]): OcdsRecord[] {
  const wanted = new Set(normalizeDepartamentoScope(departamento, departamentos));
  if (wanted.size === 0) return records;
  return records.filter((record) => wanted.has(findBuyerDepartamento(record)?.toUpperCase().trim() ?? ""));
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
  /** @deprecated Usa `departamentos` cuando el corte incluye más de una región. */
  departamento?: string;
  departamentos?: readonly string[];
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

async function recordTerritorialCoverage(input: {
  departamentos: readonly string[];
  records: OcdsRecord[];
  awards: Array<{ departamento: string | null }>;
  rejectedAwards: Array<{ raw: unknown }>;
  bidderRecords: OcdsRecord[];
  bidders: Array<{ ocid: string }>;
  batchId: number;
  isCompleteSnapshot: boolean;
  restriction: string;
}): Promise<void> {
  const { radarPool } = await import("../db/radar-pool.js");
  for (const departamento of input.departamentos) {
    const sourceRecords = input.records.filter((record) => findBuyerDepartamento(record)?.trim().toUpperCase() === departamento).length;
    const normalizedAwards = input.awards.filter((row) => row.departamento?.trim().toUpperCase() === departamento).length;
    const rejectedAwards = input.rejectedAwards.filter((row) => findBuyerDepartamento(row.raw as OcdsRecord)?.trim().toUpperCase() === departamento).length;
    const bidderSourceRecords = input.bidderRecords.filter((record) => findBuyerDepartamento(record)?.trim().toUpperCase() === departamento).length;
    const bidderDepartmentByOcid = new Map(
      input.bidderRecords
        .filter((record) => record.ocid && findBuyerDepartamento(record))
        .map((record) => [record.ocid!.trim(), findBuyerDepartamento(record)!.trim().toUpperCase()])
    );
    const normalizedBidders = input.bidders.filter((row) => bidderDepartmentByOcid.get(row.ocid) === departamento).length;
    const state = input.isCompleteSnapshot
      ? (sourceRecords === 0 ? "SIN_DATOS_EN_FUENTE" : "COMPLETA_VERIFICADA")
      : "PARCIAL";
    const shared = [departamento, sourceRecords, normalizedAwards, rejectedAwards, state,
      `oece-records:${input.batchId}`, input.restriction];
    await radarPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'compras-publicas','OECE_OCDS_AWARDS',code,true,$2,$3,$3,$4,$5,$6,now(),$7,'[]'::jsonb
       FROM territorial_jurisdictions WHERE name=$1`,
      shared
    );
    await radarPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'compras-publicas','OECE_OCDS_BIDDERS',code,true,$2,$3,$3,0,$4,$5,now(),$6,'[]'::jsonb
       FROM territorial_jurisdictions WHERE name=$1`,
      [departamento, bidderSourceRecords, normalizedBidders, state, `oece-records:${input.batchId}`, input.restriction]
    );
  }
}

/**
 * Recorre páginas de `/records` (acotado por `maxPages`), extrae awards +
 * proveedores + postores, filtra por departamento del comprador, guarda el lote crudo
 * y hace upsert por (ocid, award_id, supplier_id) en awards y (ocid, bidder_id) en bidders.
 */
export async function ingestAwards(options: IngestAwardsOptions = {}): Promise<IngestAwardsSummary> {
  const { maxPages = DEFAULT_MAX_PAGES, startPage = 1, departamento, departamentos, params = {} } = options;
  if (!Number.isInteger(maxPages) || maxPages < 0) throw new Error("maxPages debe ser entero >= 0; 0 recorre toda la ventana solicitada.");
  if (!Number.isInteger(startPage) || startPage < 1) throw new Error("startPage debe ser un entero >= 1.");
  const wantedDepartamentos = new Set(normalizeDepartamentoScope(departamento, departamentos));

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
    const rows = wantedDepartamentos.size > 0
      ? allRows.filter((r) => wantedDepartamentos.has(r.departamento?.toUpperCase().trim() ?? ""))
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
    const bidderRecords = filterRecordsByDepartment(allRecords, departamento, departamentos);
    const { rows: biddersRows, rejected: biddersRejected } = normalizeBidders(bidderRecords);
    const { inserted: biddersInserted, failed: biddersFailed } = await persistBidders(client, biddersRows, batchId);

    for (const bad of biddersRejected) {
      await client.query(
        `INSERT INTO bidders_rejected (source_batch_id, raw_bidder_data, reason) VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    await client.query("COMMIT");

    if (wantedDepartamentos.size > 0) {
      const isCompleteSnapshot = !hasNext && startPage === 1 && Object.keys(params).length === 0;
      await recordTerritorialCoverage({
        departamentos: [...wantedDepartamentos], records: allRecords, awards: allRows, rejectedAwards: rejected,
        bidderRecords, bidders: biddersRows, batchId, isCompleteSnapshot,
        restriction: isCompleteSnapshot
          ? "Recorrido hasta la página terminal del endpoint público /records sin filtros."
          : "Cobertura parcial: página inicial, paginación o parámetros de consulta acotan el recorrido de /records.",
      });
    }

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
  const departamentos = process.env.OECE_DEPARTAMENTOS
    ? normalizeDepartamentoScope(undefined, process.env.OECE_DEPARTAMENTOS.split(","))
    : process.env.OECE_DEPARTAMENTO
      ? normalizeDepartamentoScope(process.env.OECE_DEPARTAMENTO)
      : undefined;

  ingestAwards({ maxPages, departamentos })
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
