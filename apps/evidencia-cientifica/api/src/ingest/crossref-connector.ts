import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  normalizeCrossrefResponse,
  parseQueryTerms,
  type CrossrefApiResponse,
  type NormalizedCrossrefRow,
} from "./normalize.js";

const API_BASE = "https://api.crossref.org/works";
const ROWS_PER_TERM = 20;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * CrossRef da prioridad en su "polite pool" a requests que identifican un
 * contacto (mailto en el User-Agent o el query param). Sin eso, se cae al pool
 * público, con cuotas y tiempos de respuesta peores. Ver
 * https://github.com/CrossRef/rest-api-doc#good-manners--more-reliable-service
 */
function buildUrl(queryTerm: string): string {
  const params = new URLSearchParams({ query: queryTerm, rows: String(ROWS_PER_TERM) });
  const contactEmail = process.env.CROSSREF_CONTACT_EMAIL;
  if (contactEmail) params.set("mailto", contactEmail);
  return `${API_BASE}?${params.toString()}`;
}

export async function fetchWorksForTerm(queryTerm: string): Promise<{
  rawText: string;
  data: CrossrefApiResponse;
}> {
  const url = buildUrl(queryTerm);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CrossRef devolvió ${res.status} al buscar "${queryTerm}" (${url}).`);
  }
  const rawText = await res.text();
  return { rawText, data: JSON.parse(rawText) as CrossrefApiResponse };
}

async function saveRawBatch(client: PoolClient, queryTerm: string, rawText: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_crossref_batches (query_term, rows_requested, checksum, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [queryTerm, ROWS_PER_TERM, checksumOf(rawText), rawText]
  );
  return rows[0].id;
}

async function upsertWorks(
  client: PoolClient,
  batchId: number,
  queryTerm: string,
  rows: NormalizedCrossrefRow[]
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO crossref_works
         (doi, title, publisher, subjects, published_year, url, score, query_term, source_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (doi) DO UPDATE SET
         title = EXCLUDED.title,
         publisher = EXCLUDED.publisher,
         subjects = EXCLUDED.subjects,
         published_year = EXCLUDED.published_year,
         url = EXCLUDED.url,
         score = EXCLUDED.score,
         query_term = EXCLUDED.query_term,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        row.doi,
        row.title,
        row.publisher,
        row.subjects,
        row.publishedYear,
        row.url,
        row.score,
        queryTerm,
        batchId,
      ]
    );
  }
}

export interface IngestSummary {
  queryTerm: string;
  batchId: number;
  rowsUpserted: number;
}

export async function ingestTerm(queryTerm: string): Promise<IngestSummary> {
  const { rawText, data } = await fetchWorksForTerm(queryTerm);
  const rows = normalizeCrossrefResponse(data);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, queryTerm, rawText);
    await upsertWorks(client, batchId, queryTerm, rows);
    await client.query("COMMIT");
    return { queryTerm, batchId, rowsUpserted: rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * CrossRef pide no exceder ~50 req/s en el pool público; con la taxonomía por
 * defecto (10 términos) basta una pausa corta entre llamadas secuenciales.
 */
export async function ingestAllTerms(terms = parseQueryTerms(process.env.CROSSREF_QUERY_TERMS)): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];
  for (const term of terms) {
    summaries.push(await ingestTerm(term));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return summaries;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestAllTerms()
    .then((summaries) => console.log("Ingesta CrossRef completada:", summaries))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta CrossRef falló:", error);
      process.exitCode = 1;
    });
}
