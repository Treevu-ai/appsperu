import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeOcdsReleases, type OcdsRelease } from "./normalize.js";

const API_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";
const DEFAULT_MAX_PAGES = 10;

interface ReleasesPageResponse {
  releases: OcdsRelease[];
  links?: { next?: string | null; prev?: string | null };
}

export interface FetchReleasesParams {
  startDate?: string;
  endDate?: string;
  mainProcurementCategory?: string;
}

/**
 * Descarga una página de `/releases`. A diferencia del MEF, esto es JSON real
 * — sin Range requests ni parseo CSV. Confirmado en vivo el 2026-08-16:
 * 20 releases por página, orden desc por fecha de publicación por defecto.
 */
export async function fetchReleasesPage(
  page: number,
  params: FetchReleasesParams = {}
): Promise<ReleasesPageResponse> {
  const qs = new URLSearchParams({ page: String(page), order: "desc" });
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.mainProcurementCategory) qs.set("mainProcurementCategory", params.mainProcurementCategory);

  const res = await fetch(`${API_BASE_URL}/releases?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`OECE devolvió ${res.status} para la página ${page}`);
  }
  return (await res.json()) as ReleasesPageResponse;
}

function checksumOf(releases: unknown): string {
  return createHash("sha256").update(JSON.stringify(releases)).digest("hex");
}

async function saveRawBatch(
  client: PoolClient,
  pageFrom: number,
  pageTo: number,
  releases: OcdsRelease[]
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ocds_batches (page_from, page_to, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [pageFrom, pageTo, checksumOf(releases), releases.length, JSON.stringify(releases)]
  );
  return result.rows[0].id;
}

export interface IngestOptions {
  maxPages?: number;
  departamento?: string;
  params?: FetchReleasesParams;
}

export interface IngestSummary {
  batchId: number;
  pagesFetched: number;
  totalFetched: number;
  accepted: number;
  skippedOtherDepartamento: number;
  rejected: number;
  isPartial: boolean;
}

/**
 * Recorre páginas de `/releases` (acotado por `maxPages` — traer todo el
 * universo nacional no es razonable, ver docs/data-contracts), filtra por
 * departamento del comprador cuando se pasa, guarda el lote crudo y hace
 * upsert por `ocid` (cada release ya es una fila, sin agregación).
 */
export async function ingestOecdReleases(options: IngestOptions = {}): Promise<IngestSummary> {
  const { maxPages = DEFAULT_MAX_PAGES, departamento, params = {} } = options;
  const wantedDepartamento = departamento?.toUpperCase().trim();

  const allReleases: OcdsRelease[] = [];
  let page = 1;
  let pagesFetched = 0;

  for (; pagesFetched < maxPages; pagesFetched++) {
    const { releases, links } = await fetchReleasesPage(page, params);
    allReleases.push(...releases);
    if (!links?.next) {
      pagesFetched += 1;
      break;
    }
    page += 1;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, 1, page, allReleases);

    const { rows: allRows, rejected } = normalizeOcdsReleases(allReleases);
    const rows = wantedDepartamento
      ? allRows.filter((r) => r.departamento?.toUpperCase().trim() === wantedDepartamento)
      : allRows;
    const skippedOtherDepartamento = allRows.length - rows.length;

    for (const row of rows) {
      await client.query(
        `INSERT INTO procurement_processes
           (ocid, tender_id, source_id, buyer_id, buyer_name, departamento, provincia, distrito,
            categoria, titulo, valor_monto, valor_moneda, fecha_publicacion, tender_inicio, tender_fin,
            tags, source_batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (ocid) DO UPDATE
           SET titulo = EXCLUDED.titulo,
               valor_monto = EXCLUDED.valor_monto,
               valor_moneda = EXCLUDED.valor_moneda,
               tags = EXCLUDED.tags,
               source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.ocid,
          row.tenderId,
          row.sourceId,
          row.buyerId,
          row.buyerName,
          row.departamento,
          row.provincia,
          row.distrito,
          row.categoria,
          row.titulo,
          row.valorMonto,
          row.valorMoneda,
          row.fechaPublicacion,
          row.tenderInicio,
          row.tenderFin,
          JSON.stringify(row.tags),
          batchId,
        ]
      );
    }

    for (const bad of rejected) {
      await client.query(
        `INSERT INTO procurement_processes_rejected (source_batch_id, raw_release, reason)
         VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    await client.query("COMMIT");

    return {
      batchId,
      pagesFetched,
      totalFetched: allReleases.length,
      accepted: rows.length,
      skippedOtherDepartamento,
      rejected: rejected.length,
      isPartial: true,
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

  ingestOecdReleases({ maxPages, departamento })
    .then((summary) => {
      console.log("Ingesta completada:", summary);
      console.warn(
        "AVISO: esta es una ingesta PARCIAL (páginas recientes acotadas por maxPages). " +
          "No cubre el universo nacional de procesos de contratación."
      );
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
