import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeCooperativaRow, isRejected, type NormalizedCooperativa } from "./cooperativas-normalize.js";

const BASE_URL = "https://directoriocoop.produce.gob.pe/ajax/busqueda_ajax.php";
const SOURCE_NAME = "produce-busqueda-ajax";

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 2000;
const PAGE_SIZE = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DataTablesResponse {
  iTotalRecords: number;
  iTotalDisplayRecords: number;
  aaData: string[][];
}

/**
 * Endpoint DataTables 1.9 server-side (sin autenticación, confirmado en
 * vivo 2026-09-18). `actividad=1` es "AGRICULTURA, GANADERÍA, SILVICULTURA
 * Y PESCA" en el combo `cboactividad` de la página — filtro server-side
 * real (a diferencia de `directorio-cooperativas-2017.php`, que ignora este
 * parámetro y devuelve `iTotalDisplayRecords: null`; por eso ese segundo
 * endpoint quedó fuera de este conector).
 *
 * La respuesta declara `charset=ISO-8859-1` mas el payload en sí son bytes
 * ASCII-safe (PHP `json_encode` escapa todo no-ASCII como `\uXXXX`), así
 * que decodificar como latin1 o UTF-8 da el mismo resultado — se usa
 * `res.json()` estándar. **Dato confirmado en vivo (2026-09-18):** el campo
 * `representante` trae mojibake ya corrompido en el origen para un puñado
 * de cooperativas (ej. RUC 20404057805 "ACOPAGRO": el apellido "NÚÑEZ"
 * llega con hasta 3 generaciones de corrupción UTF-8↔Latin1 encadenada,
 * probablemente de reprocesos previos en el sistema de PRODUCE) —
 * `razon_social`/`direccion`/`ubicacion_texto` decodifican correctamente en
 * los mismos registros, así que el problema es específico del campo
 * `representante` en la fuente, no del pipeline de ingesta. No se intenta
 * "reparar" el mojibake (arriesgaría corromper registros ya limpios) — se
 * guarda tal cual llega, ver docs/data-contracts/produce-cooperativas.md.
 */
async function fetchPage(actividad: number, displayStart: number): Promise<DataTablesResponse> {
  const url = new URL(BASE_URL);
  url.searchParams.set("region", "0");
  url.searchParams.set("actividad", String(actividad));
  url.searchParams.set("tipo", "0");
  url.searchParams.set("modalidad", "0");
  url.searchParams.set("iDisplayStart", String(displayStart));
  url.searchParams.set("iDisplayLength", String(PAGE_SIZE));

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RastroBot/1.0)" } });
      if (!res.ok) {
        throw new Error(`PRODUCE devolvió ${res.status} al consultar el directorio de cooperativas`);
      }
      return (await res.json()) as DataTablesResponse;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Descarga del directorio de cooperativas falló tras ${MAX_ATTEMPTS} intentos: ${
      lastError instanceof Error ? lastError.message : lastError
    }`
  );
}

/**
 * Trae el universo completo para un `actividad` dado, paginando hasta que
 * `aaData` viene vacío o se alcanza `iTotalDisplayRecords` — el universo de
 * `actividad=1` son ~139 filas (confirmado en vivo), cabe holgado en un par
 * de páginas de 500.
 */
export async function* streamCooperativasRows(actividad: number): AsyncGenerator<string[]> {
  let displayStart = 0;
  for (;;) {
    const page = await fetchPage(actividad, displayStart);
    if (page.aaData.length === 0) return;

    for (const row of page.aaData) {
      yield row;
    }

    displayStart += page.aaData.length;
    if (displayStart >= page.iTotalDisplayRecords) return;
  }
}

async function saveRawBatch(client: PoolClient, actividad: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_cooperativas_batches (source, params, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [SOURCE_NAME, JSON.stringify({ actividad })]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "ruc",
  "razon_social",
  "representante",
  "direccion",
  "ubicacion_texto",
  "socios",
  "telefono",
  "correo",
  "source_batch_id",
] as const;

/**
 * Mismo patrón de dedup-por-lote que `padron-connector.ts`: Postgres
 * rechaza un `ON CONFLICT DO UPDATE` que afecte la misma fila dos veces en
 * el mismo statement.
 */
async function insertBatch(client: PoolClient, batchId: number, rows: NormalizedCooperativa[]): Promise<void> {
  if (rows.length === 0) return;

  const byRuc = new Map(rows.map((row) => [row.ruc, row]));
  const deduped = [...byRuc.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    const placeholders = INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",");
    tuples.push(`(${placeholders})`);
    values.push(
      row.ruc,
      row.razonSocial,
      row.representante,
      row.direccion,
      row.ubicacionTexto,
      row.socios,
      row.telefono,
      row.correo,
      batchId
    );
  });

  await client.query(
    `INSERT INTO cooperativas (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       representante = EXCLUDED.representante,
       direccion = EXCLUDED.direccion,
       ubicacion_texto = EXCLUDED.ubicacion_texto,
       socios = EXCLUDED.socios,
       telefono = EXCLUDED.telefono,
       correo = EXCLUDED.correo,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(
  client: PoolClient,
  batchId: number,
  rejected: { raw: string[]; reason: string }[]
): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO cooperativas_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestOptions {
  actividad?: number; // 1 = Agricultura/Ganadería/Silvicultura/Pesca (default)
}

export interface IngestSummary {
  batchId: number;
  totalRows: number;
  accepted: number;
  rejected: number;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function ingestCooperativas(options: IngestOptions = {}): Promise<IngestSummary> {
  const actividad = options.actividad ?? 1;

  const batchId = await withClient((client) => saveRawBatch(client, actividad));

  let totalRows = 0;
  let accepted = 0;
  let rejectedCount = 0;
  let acceptBuffer: NormalizedCooperativa[] = [];
  let rejectBuffer: { raw: string[]; reason: string }[] = [];

  for await (const row of streamCooperativasRows(actividad)) {
    totalRows += 1;
    const normalized = normalizeCooperativaRow(row);

    if (isRejected(normalized)) {
      rejectBuffer.push(normalized);
      rejectedCount += 1;
    } else {
      acceptBuffer.push(normalized);
      accepted += 1;
    }
  }

  await withClient((client) => insertBatch(client, batchId, acceptBuffer));
  await withClient((client) => insertRejectedBatch(client, batchId, rejectBuffer));
  await withClient((client) =>
    client.query("UPDATE raw_cooperativas_batches SET record_count = $1 WHERE id = $2", [accepted, batchId])
  );

  return { batchId, totalRows, accepted, rejected: rejectedCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const actividad = process.env.PRODUCE_COOPERATIVAS_ACTIVIDAD
    ? Number.parseInt(process.env.PRODUCE_COOPERATIVAS_ACTIVIDAD, 10)
    : undefined;

  ingestCooperativas({ actividad })
    .then((summary) => {
      console.log("Ingesta del directorio de cooperativas (PRODUCE) completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
