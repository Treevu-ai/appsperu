import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { normalizeOcdsReleases, type OcdsRelease } from "./normalize.js";

const API_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";
const DEFAULT_MAX_PAGES = 10;
export const PERU_DEPARTAMENTOS = ["AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO", "PIURA", "PUNO", "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI"] as const;

interface ReleasesPageResponse {
  releases: OcdsRelease[];
  links?: { next?: string | null; prev?: string | null };
}

export interface FetchReleasesParams {
  startDate?: string;
  endDate?: string;
  dataSegmentationID?: string;
  mainProcurementCategory?: string;
}

export class OecePageNotFoundError extends Error {
  constructor(public readonly page: number, public readonly endpoint: "/releases" | "/records") {
    super(`OECE devolvió 404 para la página ${page} de ${endpoint}`);
    this.name = "OecePageNotFoundError";
  }
}

export function releasesPageUrl(page: number, params: FetchReleasesParams = {}): string {
  const qs = new URLSearchParams({ page: String(page), order: "desc" });
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.dataSegmentationID) qs.set("dataSegmentationID", params.dataSegmentationID);
  if (params.mainProcurementCategory) qs.set("mainProcurementCategory", params.mainProcurementCategory);
  return `${API_BASE_URL}/releases?${qs.toString()}`;
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
  const res = await fetchWithTimeout(releasesPageUrl(page, params));
  if (res.status === 404) {
    throw new OecePageNotFoundError(page, "/releases");
  }
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
  releases: OcdsRelease[],
  params: FetchReleasesParams
): Promise<number> {
  const sourceUrl = releasesPageUrl(pageFrom, params);
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ocds_batches (page_from, page_to, checksum, record_count, payload, source_endpoint, source_url, query_params)
     VALUES ($1, $2, $3, $4, $5, '/releases', $6, $7::jsonb)
     RETURNING id`,
    [pageFrom, pageTo, checksumOf(releases), releases.length, JSON.stringify(releases), sourceUrl, JSON.stringify(params)]
  );
  return result.rows[0].id;
}

export interface IngestOptions {
  maxPages?: number;
  startPage?: number;
  /** @deprecated Usa `departamentos` cuando el corte incluye más de una región. */
  departamento?: string;
  departamentos?: readonly string[];
  params?: FetchReleasesParams;
}

export function normalizeDepartamentoScope(
  departamento?: string,
  departamentos?: readonly string[]
): string[] {
  const values = departamentos ?? (departamento ? [departamento] : []);
  const normalized = [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const unsupported = normalized.filter((value) => !PERU_DEPARTAMENTOS.includes(value as typeof PERU_DEPARTAMENTOS[number]));
  if (unsupported.length) throw new Error(`Departamento(s) fuera del catálogo territorial peruano: ${unsupported.join(", ")}`);
  return normalized;
}

function departamentoOfRelease(release: OcdsRelease): string | null {
  const buyerId = release.buyer?.id;
  const party = buyerId
    ? release.parties?.find((candidate) => candidate.id === buyerId)
    : undefined;
  return party?.address?.department?.trim().toUpperCase() || null;
}

async function recordTerritorialCoverage(input: {
  departamentos: readonly string[];
  releases: OcdsRelease[];
  normalized: Array<{ departamento: string | null }>;
  rejected: Array<{ raw: OcdsRelease }>;
  batchId: number;
  isCompleteSnapshot: boolean;
  restriction: string;
}): Promise<void> {
  const { radarPool } = await import("../db/radar-pool.js");
  for (const departamento of input.departamentos) {
    const sourceRecords = input.releases.filter((release) => departamentoOfRelease(release) === departamento).length;
    const normalizedRecords = input.normalized.filter((row) => row.departamento?.trim().toUpperCase() === departamento).length;
    const rejectedRecords = input.rejected.filter((row) => departamentoOfRelease(row.raw) === departamento).length;
    await radarPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'compras-publicas','OECE_OCDS_RELEASES',code,true,$2,$3,$3,$4,
              CASE WHEN $5 AND $2=0 THEN 'SIN_DATOS_EN_FUENTE'
                   WHEN $5 THEN 'COMPLETA_VERIFICADA'
                   ELSE 'PARCIAL' END,
              $6,now(),$7,'[]'::jsonb
       FROM territorial_jurisdictions WHERE name=$1`,
      [departamento, sourceRecords, normalizedRecords, rejectedRecords, input.isCompleteSnapshot,
        `oece-releases:${input.batchId}`, input.restriction]
    );
  }
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
  const { maxPages = DEFAULT_MAX_PAGES, startPage = 1, departamento, departamentos, params = {} } = options;
  if (!Number.isInteger(maxPages) || maxPages < 0) throw new Error("maxPages debe ser entero >= 0; 0 recorre toda la ventana solicitada.");
  if (!Number.isInteger(startPage) || startPage < 1) throw new Error("startPage debe ser un entero >= 1.");
  const wantedDepartamentos = new Set(normalizeDepartamentoScope(departamento, departamentos));

  const allReleases: OcdsRelease[] = [];
  let page = startPage;
  let pagesFetched = 0;
  let hasNext = false;

  for (; maxPages === 0 || pagesFetched < maxPages; pagesFetched++) {
    const { releases, links } = await fetchReleasesPage(page, params);
    allReleases.push(...releases);
    hasNext = Boolean(links?.next);
    if (!hasNext) {
      pagesFetched += 1;
      break;
    }
    page += 1;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, startPage, page - (hasNext ? 1 : 0), allReleases, params);

    const { rows: allRows, rejected } = normalizeOcdsReleases(allReleases);
    const rows = wantedDepartamentos.size > 0
      ? allRows.filter((r) => wantedDepartamentos.has(r.departamento?.toUpperCase().trim() ?? ""))
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

    if (wantedDepartamentos.size > 0) {
      const isCompleteSnapshot = !hasNext && startPage === 1 && Object.keys(params).length === 0;
      await recordTerritorialCoverage({
        departamentos: [...wantedDepartamentos], releases: allReleases, normalized: allRows, rejected, batchId,
        isCompleteSnapshot,
        restriction: isCompleteSnapshot
          ? "Recorrido hasta la página terminal del endpoint público /releases sin filtros."
          : "Cobertura parcial: página inicial, paginación o parámetros de consulta acotan el recorrido de /releases.",
      });
    }

    return {
      batchId,
      pagesFetched,
      totalFetched: allReleases.length,
      accepted: rows.length,
      skippedOtherDepartamento,
      rejected: rejected.length,
      isPartial: hasNext,
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

  ingestOecdReleases({ maxPages, departamentos })
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
