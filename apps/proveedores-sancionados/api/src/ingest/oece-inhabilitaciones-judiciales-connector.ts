import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parseInhabilitacionesJudicialesCsv, type NormalizedInhabilitacionJudicial } from "./oece-inhabilitaciones-judiciales-normalize.js";

/**
 * Fuente investigada 2026-09-20 (ver docs/data-contracts/oece-inhabilitaciones-judiciales.md):
 * el dataset "Inhabilitaciones por mandato judicial vigentes [OECE]" en
 * datosabiertos.gob.pe NO resuelve vía CKAN `package_show` como el resto del
 * catálogo — su recurso "CSV" declarado en la ficha del portal es en
 * realidad un enlace a una página de Confluence de OSCE
 * (`osce-gob-pe.atlassian.net/wiki/spaces/PNDA/...`), y el CSV real vive
 * como adjunto de esa página, detrás de la API REST pública de Confluence.
 *
 * Flujo confirmado en vivo, sin autenticación:
 * 1. `GET /wiki/rest/api/content/{PAGE_ID}/child/attachment` — lista los
 *    adjuntos de la página, cada uno con `_links.download` (ruta relativa).
 * 2. Se busca el adjunto por `title === "inhabilitaciones_judiciales.csv"`
 *    (no por posición en el array — el orden no está garantizado).
 * 3. `GET {BASE}{_links.download}` — Confluence responde 302 hacia una URL
 *    firmada y temporal de `api.media.atlassian.com` (token JWT con
 *    expiración). NO se puede hardcodear esa URL final en ningún lado — hay
 *    que resolverla en cada corrida. `fetch()` sigue el redirect solo
 *    (comportamiento default), así que este conector no necesita manejarlo
 *    a mano.
 */
const CONFLUENCE_BASE = "https://osce-gob-pe.atlassian.net/wiki";
const PAGE_ID = "106889261";
const ATTACHMENT_TITLE = "inhabilitaciones_judiciales.csv";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface ConfluenceAttachment {
  title: string;
  _links: { download: string };
}

interface ConfluenceAttachmentListResponse {
  results: ConfluenceAttachment[];
}

async function resolveDownloadUrl(): Promise<string> {
  const listUrl = `${CONFLUENCE_BASE}/rest/api/content/${PAGE_ID}/child/attachment`;
  const res = await fetch(listUrl, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Confluence devolvió ${res.status} al listar attachments de la página ${PAGE_ID}`);
  }
  const data = (await res.json()) as ConfluenceAttachmentListResponse;
  const attachment = data.results.find((a) => a.title === ATTACHMENT_TITLE);
  if (!attachment) {
    throw new Error(`No se encontró el attachment "${ATTACHMENT_TITLE}" en la página ${PAGE_ID} — el nombre del archivo pudo haber cambiado.`);
  }
  return `${CONFLUENCE_BASE}${attachment._links.download}`;
}

async function fetchCsvText(): Promise<{ text: string; sourceUrl: string }> {
  const downloadUrl = await resolveDownloadUrl();
  const res = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Descarga del CSV devolvió ${res.status}`);
  }
  // El archivo real está codificado en Latin-1, no UTF-8 (confirmado en vivo
  // 2026-09-20: byte 0xC1 crudo para "Á", no la secuencia UTF-8 0xC3 0x81) —
  // `.text()` decodificaría como UTF-8 por defecto y corrompería cualquier
  // tilde/Ñ ("REATEGUI VÁSQUEZ" salía como "REATEGUI V�SQUEZ"). Mismo bug de
  // clase ya encontrado y corregido en `sanciones-connector.ts` (RNP,
  // 2026-08-20) — mismo fix: decodificar el buffer crudo como Latin-1.
  const buffer = await res.arrayBuffer();
  return { text: Buffer.from(buffer).toString("latin1"), sourceUrl: downloadUrl };
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function saveRawBatch(client: PoolClient, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_inhabilitaciones_judiciales_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

const COLUMNS = ["fecha_corte", "ruc_dni", "nombre", "organo_jurisdiccional", "numero_resolucion", "fecha_inicio", "fecha_fin", "source_batch_id"] as const;

async function insertAceptadas(client: PoolClient, batchId: number, rows: NormalizedInhabilitacionJudicial[]): Promise<void> {
  if (rows.length === 0) return;
  // Dedup por la misma clave natural de la tabla -- si el CSV trajera la
  // misma fila dos veces en una sola corrida, el INSERT multi-VALUES fallaría
  // (Postgres no permite que un mismo INSERT toque la misma fila de conflicto
  // dos veces). No observado en vivo (15/15 filas únicas), pero mismo criterio
  // defensivo que sanciones-connector.ts.
  const byKey = new Map(rows.map((r) => [`${r.rucDni}|${r.numeroResolucion}|${r.fechaInicio}`, r]));
  const deduped = [...byKey.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * COLUMNS.length;
    tuples.push(`(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(row.fechaCorte, row.rucDni, row.nombre, row.organoJurisdiccional, row.numeroResolucion, row.fechaInicio, row.fechaFin, batchId);
  });

  await client.query(
    `INSERT INTO inhabilitaciones_judiciales (${COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc_dni, numero_resolucion, fecha_inicio) DO UPDATE SET
       fecha_corte = EXCLUDED.fecha_corte,
       nombre = EXCLUDED.nombre,
       organo_jurisdiccional = EXCLUDED.organo_jurisdiccional,
       fecha_fin = EXCLUDED.fecha_fin,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRechazadas(client: PoolClient, batchId: number, rejected: { raw: string[]; reason: string }[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO inhabilitaciones_judiciales_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface IngestSummary {
  batchId: number;
  totalFilas: number;
  aceptadas: number;
  rechazadas: number;
}

export async function ingestOeceInhabilitacionesJudiciales(): Promise<IngestSummary> {
  const { text, sourceUrl } = await fetchCsvText();
  const checksum = checksumOf(text);
  const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(text);
  const totalFilas = accepted.length + rejected.length;

  const batchId = await withClient((client) => saveRawBatch(client, sourceUrl, checksum, totalFilas));
  await withClient((client) => insertAceptadas(client, batchId, accepted));
  await withClient((client) => insertRechazadas(client, batchId, rejected));

  return { batchId, totalFilas, aceptadas: accepted.length, rechazadas: rejected.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOeceInhabilitacionesJudiciales()
    .then((summary) => {
      console.log(`OECE inhabilitaciones judiciales: ${summary.aceptadas}/${summary.totalFilas} aceptadas, ${summary.rechazadas} rechazadas (batch ${summary.batchId}).`);
      return pool.end();
    })
    .catch((err) => {
      console.error("Error en ingest:oece-inhabilitaciones-judiciales:", err);
      process.exit(1);
    });
}
