import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";
import { normalizeContractObject } from "../minor-contracts/normalize-object.js";
import { MINOR_CONTRACT_LIMIT_2026, MINOR_CONTRACT_NORMALIZER_VERSION } from "../minor-contracts/types.js";
import { classifyContractingEntity } from "./seace-public-minor-contracts-connector.js";

const LEGACY_BASE_URL = "https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/ongei/buscadorPublicoOCOS.xhtml";
const LEGACY_SOURCE = "OECE SEACE órdenes históricas (interfaz pública observada)";

export interface LegacySeaceEntity {
  ruc: string;
  officialName: string;
  department: string;
  province: string | null;
  district: string | null;
  ubigeo: string | null;
}

export interface LegacySeaceOrder {
  orderType: "O/C" | "O/S";
  orderNumber: string;
  contractingType: string | null;
  description: string | null;
  siafNumber: string | null;
  issueDate: string | null;
  commitmentDate: string | null;
  status: string | null;
  amount: number | null;
  supplierRuc: string | null;
  supplierName: string | null;
}

export interface LegacySeaceDownload {
  sourceUrl: string;
  entityName: string | null;
  content: Buffer;
}

export interface LegacySeaceIngestOptions {
  year: number;
  months?: number[];
  catalogPath?: string;
  entities?: LegacySeaceEntity[];
  maxEntities?: number;
  limitAmount?: number;
}

export interface LegacySeaceIngestSummary {
  source: "SEACE_LEGACY_ENTITY_RUC";
  year: number;
  months: number[];
  entitiesRequested: number;
  entityMonthsFetched: number;
  downloadFailures: number;
  ordersDownloaded: number;
  contractsUpserted: number;
  excludedWithoutSupplier: number;
  excludedOverLimit: number;
}

export function buildLegacySeaceOrdersUrl(input: { ruc: string; year: number; month: number }): string {
  if (!/^\d{11}$/.test(input.ruc)) throw new Error("El RUC de la entidad debe tener 11 dígitos.");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new Error("Año inválido.");
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) throw new Error("Mes inválido.");
  const params = new URLSearchParams({
    anio: String(input.year), mes: String(input.month).padStart(2, "0"), ruc_entidad: input.ruc, theme: "ongei",
  });
  return `${LEGACY_BASE_URL}?${params}`;
}

function checksumOf(payload: Buffer | unknown): string {
  return createHash("sha256").update(Buffer.isBuffer(payload) ? payload : JSON.stringify(payload)).digest("hex");
}

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = decodeHtml(String(value).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeDate(value: unknown): string | null {
  const text = stripHtml(value);
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}-05:00` : null;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = stripHtml(value)?.replace(/S\/.?/i, "").replace(/,/g, "").replace(/\s/g, "");
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOrder(cells: unknown[]): LegacySeaceOrder | null {
  const orderType = stripHtml(cells[1]);
  if (orderType !== "O/C" && orderType !== "O/S") return null;
  return {
    orderType,
    orderNumber: stripHtml(cells[2]) ?? "",
    contractingType: stripHtml(cells[3]), description: stripHtml(cells[4]), siafNumber: stripHtml(cells[5]),
    issueDate: normalizeDate(cells[6]), commitmentDate: normalizeDate(cells[7]), status: stripHtml(cells[8]),
    amount: money(cells[9]), supplierRuc: stripHtml(cells[10])?.replace(/\D/g, "") || null, supplierName: stripHtml(cells[11]),
  };
}

export function parseLegacySeaceOrdersWorkbook(content: Buffer): LegacySeaceOrder[] {
  const workbook = XLSX.read(content, { type: "buffer", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: null, raw: false });
  const headerIndex = rows.findIndex((row) => row.some((cell) => /Tipo de Orden/i.test(String(cell ?? ""))) && row.some((cell) => /N.mero de orden/i.test(String(cell ?? ""))));
  if (headerIndex < 0) throw new Error("El XLS histórico de SEACE no contiene las columnas esperadas de órdenes.");
  return rows.slice(headerIndex + 1).map(toOrder).filter((row): row is LegacySeaceOrder => row !== null && Boolean(row.orderNumber));
}

function cookiesFrom(response: Response): string {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const raw = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
  return raw.filter(Boolean).map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

function formAction(html: string): string {
  const encoded = html.match(/<form[^>]+action="([^"]+)"/i)?.[1];
  if (!encoded) throw new Error("SEACE no devolvió la acción del formulario de exportación.");
  return decodeHtml(encoded);
}

function viewState(html: string): string {
  const value = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i)?.[1];
  if (!value) throw new Error("SEACE no devolvió el estado del formulario de exportación.");
  return decodeHtml(value);
}

export async function fetchLegacySeaceOrdersExport(input: { ruc: string; year: number; month: number }): Promise<LegacySeaceDownload> {
  const sourceUrl = buildLegacySeaceOrdersUrl(input);
  const first = await fetchWithTimeout(sourceUrl, { headers: { Accept: "text/html" } });
  if (!first.ok) throw new Error(`SEACE histórico devolvió ${first.status} para ${sourceUrl}`);
  const html = await first.text();
  const action = formAction(html);
  const body = new URLSearchParams({
    formBuscador: "formBuscador", "formBuscador:btnExportar": "formBuscador:btnExportar", "javax.faces.ViewState": viewState(html),
  });
  const exportUrl = new URL(action, "https://prod2.seace.gob.pe").toString();
  const exported = await fetchWithTimeout(exportUrl, {
    method: "POST",
    headers: { Accept: "application/vnd.ms-excel", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookiesFrom(first) }, body,
  });
  if (!exported.ok) throw new Error(`La exportación histórica de SEACE devolvió ${exported.status} para ${sourceUrl}`);
  const content = Buffer.from(await exported.arrayBuffer());
  if (!content.length) throw new Error("La exportación histórica de SEACE llegó vacía.");
  const title = html.match(/font-size:16px[^>]*>([^<]+)</i)?.[1] ?? null;
  return { sourceUrl, entityName: title ? stripHtml(title) : null, content };
}

export async function loadLegacySeaceEntityCatalog(filePath: string): Promise<LegacySeaceEntity[]> {
  const content = await readFile(filePath);
  const workbook = XLSX.read(content, { type: "buffer", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("El catálogo de entidades no contiene una hoja legible.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const records = rows.map((row) => ({
    ruc: String(row.ruc ?? row.RUC ?? "").replace(/\D/g, ""), officialName: String(row.official_name ?? row.nombre_oficial ?? row.nombre ?? "").trim(),
    department: String(row.department ?? row.departamento ?? "LA LIBERTAD").trim().toLocaleUpperCase("es-PE"),
    province: stripHtml(row.province ?? row.provincia), district: stripHtml(row.district ?? row.distrito), ubigeo: stripHtml(row.ubigeo),
  }));
  const invalid = records.filter((entity) => !/^\d{11}$/.test(entity.ruc) || !entity.officialName || entity.department !== "LA LIBERTAD");
  if (invalid.length) throw new Error(`El catálogo tiene ${invalid.length} fila(s) sin RUC, nombre o departamento LA LIBERTAD verificable.`);
  const unique = new Map(records.map((entity) => [entity.ruc, entity]));
  return [...unique.values()];
}

async function saveRawBatch(client: PoolClient, input: { sourceUrl: string; year: number; entity: LegacySeaceEntity; month: number; orders: LegacySeaceOrder[]; content: Buffer }): Promise<number> {
  const payload = { entity: input.entity, month: input.month, parsedOrders: input.orders, artifactSha256: checksumOf(input.content) };
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_minor_contract_batches (source_system,source_url,department,year,page_from,page_to,checksum,record_count,payload)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8::jsonb) RETURNING id`,
    [LEGACY_SOURCE, input.sourceUrl, input.entity.department, input.year, input.month, checksumOf(input.content), input.orders.length, JSON.stringify(payload)],
  );
  const batchId = result.rows[0].id;
  await client.query(
    `INSERT INTO raw_minor_contract_artifacts (minor_source_batch_id,filename,media_type,content_sha256,content)
     VALUES ($1,$2,'application/vnd.ms-excel',$3,$4) ON CONFLICT DO NOTHING`,
    [batchId, `seace-ocos-${input.entity.ruc}-${input.year}-${String(input.month).padStart(2, "0")}.xls`, checksumOf(input.content), input.content],
  );
  return batchId;
}

async function upsertLegacyOrder(client: PoolClient, input: { entity: LegacySeaceEntity; order: LegacySeaceOrder; year: number; month: number; sourceUrl: string; batchId: number }): Promise<void> {
  const { entity, order } = input;
  if (!order.supplierRuc || !order.supplierName || order.amount === null) throw new Error("La orden no tiene proveedor o monto materializable.");
  const municipalityId = `seace:legacy:ruc:${entity.ruc}`;
  const supplierId = `seace:ruc:${order.supplierRuc}`;
  const sourceRow = { entityRuc: entity.ruc, year: input.year, month: input.month, order };
  const rowHash = checksumOf(sourceRow).slice(0, 24);
  const contractingId = `seace:legacy:order:${rowHash}`;
  const sourceTimestamp = new Date().toISOString();
  const category = order.orderType === "O/S" ? "services" : "goods";
  await client.query(
    `INSERT INTO municipalities (municipality_id,ruc,official_name,department,province,district,ubigeo,entity_type,source,source_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (municipality_id) DO UPDATE SET ruc=EXCLUDED.ruc,official_name=EXCLUDED.official_name,province=EXCLUDED.province,
       district=EXCLUDED.district,ubigeo=EXCLUDED.ubigeo,entity_type=EXCLUDED.entity_type,source=EXCLUDED.source,source_timestamp=EXCLUDED.source_timestamp`,
    [municipalityId, entity.ruc, entity.officialName, entity.department, entity.province, entity.district, entity.ubigeo, classifyContractingEntity(entity.officialName), LEGACY_SOURCE, sourceTimestamp],
  );
  await client.query(
    `INSERT INTO supplier_profiles (supplier_id,ruc,legal_name,first_seen,last_seen,source,source_timestamp)
     VALUES ($1,$2,$3,$4,$4,$5,$6)
     ON CONFLICT (supplier_id) DO UPDATE SET ruc=EXCLUDED.ruc,legal_name=EXCLUDED.legal_name,last_seen=GREATEST(supplier_profiles.last_seen,EXCLUDED.last_seen),source=EXCLUDED.source,source_timestamp=EXCLUDED.source_timestamp`,
    [supplierId, order.supplierRuc, order.supplierName, order.issueDate ?? sourceTimestamp, LEGACY_SOURCE, sourceTimestamp],
  );
  await client.query(
    `INSERT INTO minor_contracts (contracting_id,source_contracting_id,ocid,award_id,municipality_id,year,object_original,object_normalized,category,contract_type,awarded_amount,
      execution_department,execution_province,execution_district,publication_date,award_date,winning_supplier_id,status,order_number,source_url,source_timestamp,source_batch_id,minor_source_batch_id,data_version,normalizer_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,$18,$19,NULL,$20,'oece-seace-legacy-orders-v1',$21)
     ON CONFLICT (contracting_id) DO UPDATE SET object_original=EXCLUDED.object_original,object_normalized=EXCLUDED.object_normalized,awarded_amount=EXCLUDED.awarded_amount,
       publication_date=EXCLUDED.publication_date,award_date=EXCLUDED.award_date,winning_supplier_id=EXCLUDED.winning_supplier_id,status=EXCLUDED.status,source_url=EXCLUDED.source_url,
       source_timestamp=EXCLUDED.source_timestamp,minor_source_batch_id=EXCLUDED.minor_source_batch_id,updated_at=now()`,
    [contractingId, `${entity.ruc}:${input.year}:${input.month}:${order.orderType}:${order.orderNumber}`, `seace:legacy:orders:${entity.ruc}:${input.year}:${input.month}`,
      `seace:legacy:award:${rowHash}`, municipalityId, input.year, order.description, normalizeContractObject(order.description), category, order.amount,
      entity.department, entity.province, entity.district, order.issueDate, supplierId, order.status ?? "REGISTERED", order.orderNumber, input.sourceUrl, sourceTimestamp, input.batchId, MINOR_CONTRACT_NORMALIZER_VERSION],
  );
  await client.query(
    `INSERT INTO contract_evidence (contracting_id,signal_id,evidence_type,source_record,source_url,field,observed_value,capture_timestamp,confidence,source_batch_id,minor_source_batch_id)
     VALUES ($1,NULL,'SEACE_LEGACY_ORDER',$2,$3,'order',$4::jsonb,now(),1,NULL,$5) ON CONFLICT DO NOTHING`,
    [contractingId, `${order.orderType}:${order.orderNumber}`, input.sourceUrl, JSON.stringify(order), input.batchId],
  );
  if (order.issueDate) await client.query(
    `INSERT INTO contract_events (event_id,contracting_id,event_type,event_timestamp,publication_timestamp,description,source_url,source_batch_id,minor_source_batch_id)
     VALUES ($1,$2,'ORDER',$3,$3,$4,$5,NULL,$6)
     ON CONFLICT (event_id) DO UPDATE SET event_timestamp=EXCLUDED.event_timestamp,publication_timestamp=EXCLUDED.publication_timestamp,description=EXCLUDED.description,source_url=EXCLUDED.source_url,minor_source_batch_id=EXCLUDED.minor_source_batch_id`,
    [`${contractingId}:ORDER`, contractingId, order.issueDate, `Orden ${order.orderType} ${order.orderNumber} registrada por SEACE`, input.sourceUrl, input.batchId],
  );
}

export async function ingestLegacySeaceOrders(options: LegacySeaceIngestOptions): Promise<LegacySeaceIngestSummary> {
  const months = options.months ?? Array.from({ length: 12 }, (_, index) => index + 1);
  if (!months.length || months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) throw new Error("La corrida histórica requiere meses válidos entre 1 y 12.");
  const entities = (options.entities ?? await loadLegacySeaceEntityCatalog(options.catalogPath ?? process.env.SEACE_LEGACY_ENTITY_CATALOG_PATH ?? ""))
    .slice(0, options.maxEntities && options.maxEntities > 0 ? options.maxEntities : undefined);
  if (!entities.length) throw new Error("No hay entidades verificadas para consultar la ruta histórica de SEACE.");
  const summary: LegacySeaceIngestSummary = { source: "SEACE_LEGACY_ENTITY_RUC", year: options.year, months, entitiesRequested: entities.length, entityMonthsFetched: 0, downloadFailures: 0, ordersDownloaded: 0, contractsUpserted: 0, excludedWithoutSupplier: 0, excludedOverLimit: 0 };
  const limitAmount = options.limitAmount ?? MINOR_CONTRACT_LIMIT_2026;
  for (const entity of entities) for (const month of months) {
    try {
      const download = await fetchLegacySeaceOrdersExport({ ruc: entity.ruc, year: options.year, month });
      const orders = parseLegacySeaceOrdersWorkbook(download.content);
      summary.entityMonthsFetched += 1;
      summary.ordersDownloaded += orders.length;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const batchId = await saveRawBatch(client, { sourceUrl: download.sourceUrl, year: options.year, entity, month, orders, content: download.content });
        for (const order of orders) {
          if (!order.supplierRuc || !order.supplierName || order.amount === null) { summary.excludedWithoutSupplier += 1; continue; }
          if (order.amount < 0 || order.amount > limitAmount) { summary.excludedOverLimit += 1; continue; }
          await upsertLegacyOrder(client, { entity, order, year: options.year, month, sourceUrl: download.sourceUrl, batchId });
          summary.contractsUpserted += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK"); throw error;
      } finally { client.release(); }
    } catch (error) {
      summary.downloadFailures += 1;
      console.error(JSON.stringify({ source: LEGACY_SOURCE, ruc: entity.ruc, year: options.year, month, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  return summary;
}

export function catalogPathFromArgs(args: string[]): string | undefined {
  const index = args.indexOf("--catalog");
  return index >= 0 ? path.resolve(args[index + 1] ?? "") : undefined;
}
