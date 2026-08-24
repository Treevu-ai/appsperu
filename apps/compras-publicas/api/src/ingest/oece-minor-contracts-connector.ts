import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { normalizeContractObject } from "../minor-contracts/normalize-object.js";
import { MINOR_CONTRACT_LIMIT_2026, MINOR_CONTRACT_NORMALIZER_VERSION } from "../minor-contracts/types.js";

const BASE_URL = "https://prod6.seace.gob.pe/v1/s8uit-services/buscadorpublico";
const PUBLIC_DETAIL_URL = "https://prod6.seace.gob.pe/buscador-publico/contrataciones";
const LA_LIBERTAD_DEPARTMENT_CODE = "13";
const SOURCE_SYSTEM = "OECE SEACE buscador público (interfaz no documentada)";
const DETAIL_REQUEST_CONCURRENCY = 5;
const SEARCH_PAGE_SIZE = 5_000;

export type ContractingEntityType = "MUNICIPALITY_DISTRICT" | "MUNICIPALITY_PROVINCE" | "REGIONAL_GOVERNMENT" | "OTHER_PUBLIC_ENTITY";

export interface PublicMinorContractSearchRow {
  idContrato: number;
  nomEntidad: string;
  nomObjetoContrato: string | null;
  nomEstadoContrato: string | null;
}

export interface PublicMinorContractDetail {
  uitContratoCompletoProjection?: {
    idContrato?: number;
    idEntidad?: number;
    nomEntidad?: string;
    anio?: number;
    nroDescripcion?: string;
    desObjetoContrato?: string;
    nomObjetoContrato?: string;
    nomEstadoContrato?: string;
    fecPublica?: string;
  };
  uitContratoEtapaProjectionList?: Array<{ nomEtapaContrato?: string; fecIni?: string; fecFin?: string }>;
  uitContratoItemProjectionList?: Array<{
    idContratoItem?: number;
    nomDistrito?: string;
    nomDistritoExt?: string;
    descripcionItem?: string;
    codRuc?: string;
    nomRazonSocial?: string;
    precioTotal?: number;
    nomEstadoCotiza?: string;
  }>;
}

interface PublicMinorContractSearchResponse {
  data: PublicMinorContractSearchRow[];
  pageable: { totalElements: number; pageNumber: number; pageSize: number };
}

export interface SeaceMinorContractOptions {
  year?: number;
  maxContracts?: number;
  limitAmount?: number;
}

export interface SeaceMinorContractSummary {
  runId: string;
  sourcePages: number;
  sourceRecords: number;
  entitiesDiscovered: number;
  entitiesWithDetails: number;
  entitiesWithDetailFailures: number;
  detailsFetched: number;
  detailsFailed: number;
  contractsUpserted: number;
  municipalitiesUpserted: number;
  suppliersUpserted: number;
  excludedWithoutAward: number;
  excludedOverLimit: number;
  source: "SEACE_PUBLIC_INTERFACE";
  isPartial: boolean;
}

export function parseSeaceDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}-05:00` : null;
}

export function categoryFromSeace(value: string | null | undefined): "goods" | "services" | null {
  const normalized = value?.trim().toLocaleLowerCase("es-PE");
  if (normalized === "bien") return "goods";
  if (normalized === "servicio") return "services";
  return null;
}

export function classifyContractingEntity(name: string | null | undefined): ContractingEntityType {
  const normalized = name?.trim() ?? "";
  if (/^MUNICIPALIDAD DISTRITAL\b/i.test(normalized)) return "MUNICIPALITY_DISTRICT";
  if (/^MUNICIPALIDAD PROVINCIAL\b/i.test(normalized)) return "MUNICIPALITY_PROVINCE";
  if (/^(GOBIERNO REGIONAL\b|REGION\s+LA\s+LIBERTAD\b)/i.test(normalized)) return "REGIONAL_GOVERNMENT";
  return "OTHER_PUBLIC_ENTITY";
}

function checksumOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sourceDetailUrl(contractId: number): string {
  return `${PUBLIC_DETAIL_URL}/${contractId}`;
}

function locationFrom(item: NonNullable<PublicMinorContractDetail["uitContratoItemProjectionList"]>[number]) {
  const raw = item.nomDistritoExt ?? item.nomDistrito ?? null;
  const parts = raw?.split("/").map((value) => value.trim()).filter(Boolean) ?? [];
  return {
    department: parts.length >= 1 ? parts[0] : null,
    province: parts.length >= 2 ? parts[1] : null,
    district: parts.length >= 3 ? parts[2] : null,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`SEACE devolvió ${response.status} para ${url}`);
  return (await response.json()) as T;
}

export async function fetchSeaceMinorContractSearchPage(
  year: number,
  page: number,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<{ body: PublicMinorContractSearchResponse; url: string }> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > SEARCH_PAGE_SIZE) {
    throw new Error("Página o tamaño de página inválido para la búsqueda pública de SEACE.");
  }
  const params = new URLSearchParams({
    anio: String(year), codigo_departamento: LA_LIBERTAD_DEPARTMENT_CODE,
    palabra_clave: "", orden: "2", page: String(page), page_size: String(pageSize),
  });
  const url = `${BASE_URL}/contrataciones/buscador?${params}`;
  return { body: await fetchJson<PublicMinorContractSearchResponse>(url), url };
}

export async function fetchAllSeaceMinorContractSearchPages(year: number): Promise<Array<{ body: PublicMinorContractSearchResponse; url: string }>> {
  const first = await fetchSeaceMinorContractSearchPage(year, 1);
  const pageSize = first.body.pageable.pageSize || SEARCH_PAGE_SIZE;
  const total = first.body.pageable.totalElements;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = [first];
  for (let page = 2; page <= pageCount; page += 1) pages.push(await fetchSeaceMinorContractSearchPage(year, page, pageSize));
  return pages;
}

export async function fetchSeaceMinorContractDetail(contractId: number): Promise<PublicMinorContractDetail> {
  return fetchJson<PublicMinorContractDetail>(`${BASE_URL}/contrataciones/listar-completo?id_contrato=${contractId}`);
}

async function saveRawBatch(
  client: PoolClient,
  input: { url: string; year: number; pageFrom: number | null; pageTo: number | null; payload: unknown; recordCount: number }
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_minor_contract_batches
       (source_system, source_url, department, year, page_from, page_to, checksum, record_count, payload)
     VALUES ($1,$2,'LA LIBERTAD',$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id`,
    [SOURCE_SYSTEM, input.url, input.year, input.pageFrom, input.pageTo, checksumOf(input.payload), input.recordCount, JSON.stringify(input.payload)]
  );
  return result.rows[0].id;
}

async function insertEvidence(
  client: PoolClient,
  input: { contractingId: string; sourceRecord: string; sourceUrl: string; field: string; observedValue: Record<string, unknown>; minorSourceBatchId: number }
) {
  await client.query(
    `INSERT INTO contract_evidence
       (contracting_id, signal_id, evidence_type, source_record, source_url, field, observed_value,
        capture_timestamp, confidence, source_batch_id, minor_source_batch_id)
     VALUES ($1,NULL,'SEACE_PUBLIC_FIELD',$2,$3,$4,$5::jsonb,now(),1,NULL,$6)
     ON CONFLICT DO NOTHING`,
    [input.contractingId, input.sourceRecord, input.sourceUrl, input.field, JSON.stringify(input.observedValue), input.minorSourceBatchId]
  );
}

/**
 * Ingiere todas las adjudicaciones visibles que devuelve el buscador departamental
 * para La Libertad. Incluye municipalidades distritales y provinciales, Gobierno
 * Regional y otras entidades públicas: el tipo queda persistido para que las
 * comparaciones territoriales no mezclen universos. El buscador es una interfaz
 * pública observada, no un API documentado; una corrida completa significa
 * "todas las páginas devueltas por la fuente", no el universo no publicado.
 */
export async function ingestSeacePublicMinorContracts(options: SeaceMinorContractOptions = {}): Promise<SeaceMinorContractSummary> {
  const year = options.year ?? 2026;
  const maxContracts = options.maxContracts ?? 100;
  const limitAmount = options.limitAmount ?? MINOR_CONTRACT_LIMIT_2026;
  const runId = randomUUID();
  const pages = await fetchAllSeaceMinorContractSearchPages(year);
  const sourceRows = pages.flatMap(({ body }) => body.data);
  const selected = maxContracts > 0 ? sourceRows.slice(0, maxContracts) : sourceRows;
  const discoveredEntities = new Map<string, ContractingEntityType>();
  for (const row of sourceRows) discoveredEntities.set(row.nomEntidad, classifyContractingEntity(row.nomEntidad));

  // La interfaz no publica una política de rate limit. Se procesan lotes cortos
  // para no convertir una corrida completa en una ráfaga contra el servicio.
  type DetailFetchOutcome = { row: PublicMinorContractSearchRow; detail: PublicMinorContractDetail | null; error: string | null };
  const outcomes: DetailFetchOutcome[] = [];
  for (let start = 0; start < selected.length; start += DETAIL_REQUEST_CONCURRENCY) {
    const batch = await Promise.all(
      selected.slice(start, start + DETAIL_REQUEST_CONCURRENCY)
        .map(async (row): Promise<DetailFetchOutcome> => {
          try {
            return { row, detail: await fetchSeaceMinorContractDetail(row.idContrato), error: null };
          } catch (error) {
            return { row, detail: null, error: error instanceof Error ? error.message : String(error) };
          }
        })
    );
    outcomes.push(...batch);
  }
  const details = outcomes.flatMap((result) => result.detail ? [{ row: result.row, detail: result.detail }] : []);
  const detailEntityNames = new Set(details.map(({ row, detail }) => detail.uitContratoCompletoProjection?.nomEntidad ?? row.nomEntidad));
  const failedEntityNames = new Set(outcomes.filter((result) => result.error !== null).map((result) => result.row.nomEntidad));

  const client = await pool.connect();
  const upsertedContractIds = new Set<string>();
  let municipalities = new Set<string>();
  let suppliers = new Set<string>();
  let excludedWithoutAward = 0;
  let excludedOverLimit = 0;
  try {
    await client.query("BEGIN");
    for (const [index, page] of pages.entries()) {
      await saveRawBatch(client, { url: page.url, year, pageFrom: index + 1, pageTo: index + 1, payload: page.body, recordCount: page.body.data.length });
    }

    for (const { row, detail } of details) {
      const general = detail.uitContratoCompletoProjection;
      const entityName = general?.nomEntidad ?? row.nomEntidad;
      const entityId = general?.idEntidad;
      const category = categoryFromSeace(general?.nomObjetoContrato ?? row.nomObjetoContrato);
      if (!general?.idContrato || !entityId || !category) continue;

      const contractId = general.idContrato;
      const detailUrl = sourceDetailUrl(contractId);
      const detailBatchId = await saveRawBatch(client, { url: detailUrl, year, pageFrom: null, pageTo: null, payload: detail, recordCount: 1 });
      const municipalityId = `seace:entity:${entityId}`;
      const sourceTimestamp = new Date().toISOString();
      const quotationStage = detail.uitContratoEtapaProjectionList?.find((stage) => /COTIZACI[ÓO]N/i.test(stage.nomEtapaContrato ?? ""));
      const publicationDate = parseSeaceDate(general.fecPublica);

      for (const item of detail.uitContratoItemProjectionList ?? []) {
        const amount = item.precioTotal;
        const awarded = item.nomEstadoCotiza?.toLocaleUpperCase("es-PE") === "ADJUDICADO";
        if (!awarded || amount == null || !Number.isFinite(amount)) { excludedWithoutAward += 1; continue; }
        if (amount < 0 || amount > limitAmount) { excludedOverLimit += 1; continue; }
        if (!item.idContratoItem || !item.codRuc || !item.nomRazonSocial) { excludedWithoutAward += 1; continue; }

        const supplierId = `seace:ruc:${item.codRuc}`;
        const canonicalId = `seace:contract:${contractId}:item:${item.idContratoItem}`;
        const location = locationFrom(item);
        const objectOriginal = item.descripcionItem ?? general.desObjetoContrato ?? null;

        await client.query(
          `INSERT INTO municipalities
             (municipality_id, official_name, department, province, district, entity_code_oece, entity_type, source, source_timestamp)
           VALUES ($1,$2,'LA LIBERTAD',$3,$4,$5,$6,$7,$8)
           ON CONFLICT (municipality_id) DO UPDATE SET official_name=EXCLUDED.official_name,
             province=COALESCE(EXCLUDED.province, municipalities.province), district=COALESCE(EXCLUDED.district, municipalities.district),
             entity_code_oece=EXCLUDED.entity_code_oece, entity_type=EXCLUDED.entity_type,
             source=EXCLUDED.source, source_timestamp=EXCLUDED.source_timestamp`,
          [municipalityId, entityName, location.province, location.district, String(entityId), classifyContractingEntity(entityName), SOURCE_SYSTEM, sourceTimestamp]
        );
        municipalities.add(municipalityId);
        await client.query(
          `INSERT INTO supplier_profiles (supplier_id, ruc, legal_name, first_seen, last_seen, source, source_timestamp)
           VALUES ($1,$2,$3,$4,$4,$5,$6)
           ON CONFLICT (supplier_id) DO UPDATE SET legal_name=EXCLUDED.legal_name,
             ruc=COALESCE(supplier_profiles.ruc, EXCLUDED.ruc), last_seen=GREATEST(supplier_profiles.last_seen, EXCLUDED.last_seen),
             source=EXCLUDED.source, source_timestamp=EXCLUDED.source_timestamp`,
          [supplierId, item.codRuc, item.nomRazonSocial, publicationDate ?? sourceTimestamp, SOURCE_SYSTEM, sourceTimestamp]
        );
        suppliers.add(supplierId);
        await client.query(
          `INSERT INTO minor_contracts
             (contracting_id, source_contracting_id, ocid, award_id, municipality_id, year,
              object_original, object_normalized, category, contract_type, awarded_amount,
              execution_department, execution_province, execution_district,
              publication_date, quotation_start_date, quotation_end_date, winning_supplier_id,
              status, source_url, source_timestamp, source_batch_id, minor_source_batch_id, data_version, normalizer_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16,'AWARDED',$17,$18,NULL,$19,
                   'oece-seace-public-ui-v1',$20)
           ON CONFLICT (contracting_id) DO UPDATE SET object_original=EXCLUDED.object_original,
             object_normalized=EXCLUDED.object_normalized, category=EXCLUDED.category, awarded_amount=EXCLUDED.awarded_amount,
             execution_department=EXCLUDED.execution_department, execution_province=EXCLUDED.execution_province,
             execution_district=EXCLUDED.execution_district,
             publication_date=EXCLUDED.publication_date, quotation_start_date=EXCLUDED.quotation_start_date,
             quotation_end_date=EXCLUDED.quotation_end_date, winning_supplier_id=EXCLUDED.winning_supplier_id,
             status=EXCLUDED.status, source_url=EXCLUDED.source_url, source_timestamp=EXCLUDED.source_timestamp,
             source_batch_id=NULL, minor_source_batch_id=EXCLUDED.minor_source_batch_id, updated_at=now()`,
          [canonicalId, String(contractId), `seace:contract:${contractId}`, String(item.idContratoItem), municipalityId, year,
            objectOriginal, normalizeContractObject(objectOriginal), category, amount,
            location.department, location.province, location.district, publicationDate,
            parseSeaceDate(quotationStage?.fecIni), parseSeaceDate(quotationStage?.fecFin), supplierId,
            detailUrl, sourceTimestamp, detailBatchId, MINOR_CONTRACT_NORMALIZER_VERSION]
        );
        upsertedContractIds.add(canonicalId);
        for (const evidence of [
          { field: "contract", value: { contractId, number: general.nroDescripcion, status: general.nomEstadoContrato } },
          { field: "item_award", value: { itemId: item.idContratoItem, amount, awardStatus: item.nomEstadoCotiza } },
          { field: "supplier", value: { ruc: item.codRuc, legalName: item.nomRazonSocial } },
        ]) await insertEvidence(client, { contractingId: canonicalId, sourceRecord: String(contractId), sourceUrl: detailUrl, field: evidence.field, observedValue: evidence.value, minorSourceBatchId: detailBatchId });

        for (const event of [
          { type: "REQUIREMENT_PUBLICATION", at: publicationDate, description: "Publicación en el buscador público de contratos menores de SEACE" },
          { type: "QUOTATION", at: parseSeaceDate(quotationStage?.fecIni), description: "Inicio de etapa de cotización publicado por SEACE" },
        ].filter((event): event is { type: "REQUIREMENT_PUBLICATION" | "QUOTATION"; at: string; description: string } => Boolean(event.at))) {
          await client.query(
            `INSERT INTO contract_events
               (event_id, contracting_id, event_type, event_timestamp, publication_timestamp, description, source_url, source_batch_id, minor_source_batch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8)
             ON CONFLICT (event_id) DO UPDATE SET event_timestamp=EXCLUDED.event_timestamp, publication_timestamp=EXCLUDED.publication_timestamp,
               description=EXCLUDED.description, source_url=EXCLUDED.source_url, source_batch_id=NULL, minor_source_batch_id=EXCLUDED.minor_source_batch_id`,
            [`${canonicalId}:${event.type}`, canonicalId, event.type, event.at, publicationDate, event.description, detailUrl, detailBatchId]
          );
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return {
    runId, sourcePages: pages.length, sourceRecords: sourceRows.length,
    entitiesDiscovered: discoveredEntities.size, entitiesWithDetails: detailEntityNames.size,
    entitiesWithDetailFailures: failedEntityNames.size,
    detailsFetched: details.length, detailsFailed: selected.length - details.length, contractsUpserted: upsertedContractIds.size,
    municipalitiesUpserted: municipalities.size, suppliersUpserted: suppliers.size,
    excludedWithoutAward, excludedOverLimit, source: "SEACE_PUBLIC_INTERFACE",
    isPartial: maxContracts > 0 && selected.length < sourceRows.length,
  };
}
