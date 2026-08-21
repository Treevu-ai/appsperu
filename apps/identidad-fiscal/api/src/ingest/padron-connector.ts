import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import unzipper from "unzipper";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeContribuyenteRow, isRejected, type NormalizedContribuyente } from "./normalize.js";

const DOWNLOAD_URL = "https://www2.sunat.gob.pe/padron_reducido_ruc.zip";
const ZIP_ENTRY_NAME = "padron_reducido_ruc.txt";

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 2000;
const INSERT_BATCH_SIZE = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Descarga el ZIP del Padrón Reducido RUC a un archivo temporal — pesa
 * ~373MB comprimido (confirmado en vivo el 2026-08-20), no cabe cómodo en
 * memoria junto con el resto del proceso de ingesta. Mismo patrón de retry
 * con backoff que `infobras-connector.ts`: portales grandes del Estado
 * peruano han mostrado 503 intermitentes bajo archivos grandes.
 */
export async function downloadPadronZip(destPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(DOWNLOAD_URL);
      if (!res.ok || !res.body) {
        throw new Error(`SUNAT devolvió ${res.status} al descargar el padrón`);
      }
      const fileStream = createWriteStream(destPath);
      await new Promise<void>((resolve, reject) => {
        const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
        nodeStream.pipe(fileStream);
        nodeStream.on("error", reject);
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Descarga del padrón RUC falló tras ${MAX_ATTEMPTS} intentos: ${lastError instanceof Error ? lastError.message : lastError}`
  );
}

/**
 * Lee el único archivo dentro del ZIP en streaming (decodificado como
 * ISO-8859-1/Latin-1, confirmado en vivo — NO es UTF-8, ver
 * docs/data-contracts/sunat-padron-ruc.md) y separa por líneas, con el mismo
 * patrón de "leftover" que `infobras-connector.ts` usa para no cortar una
 * línea a la mitad entre chunks. El archivo descomprime a ~1.5GB — nunca se
 * acumula completo en memoria, se yieldea línea por línea.
 */
export async function* streamPadronLines(zipPath: string): AsyncGenerator<string> {
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find((f) => f.path === ZIP_ENTRY_NAME);
  if (!entry) {
    throw new Error(`El ZIP del padrón no tiene la entrada esperada "${ZIP_ENTRY_NAME}" — formato inesperado.`);
  }

  let leftover = "";
  for await (const chunk of entry.stream()) {
    const text = leftover + (chunk as Buffer).toString("latin1");
    const lines = text.split("\n");
    leftover = lines.pop() ?? "";
    for (const line of lines) {
      yield line;
    }
  }
  if (leftover.trim() !== "") {
    yield leftover;
  }
}

function checksumOf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function saveRawBatch(client: PoolClient, checksum: string): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_padron_batches (filename, checksum, record_count) VALUES ($1, $2, 0) RETURNING id`,
    ["padron_reducido_ruc.zip", checksum]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "ruc",
  "razon_social",
  "estado_contribuyente",
  "condicion_domicilio",
  "ubigeo",
  "tipo_via",
  "nombre_via",
  "numero",
  "source_batch_id",
] as const;

/**
 * Inserta un lote en un solo INSERT multi-fila. Postgres rechaza un
 * `ON CONFLICT DO UPDATE` que afecte la misma fila dos veces dentro del
 * mismo statement — por eso se deduplica por RUC dentro del lote antes de
 * construir el VALUES (se queda con la última ocurrencia, no debería pasar
 * en la práctica porque RUC es único por diseño, pero es una garantía barata).
 */
async function insertBatch(client: PoolClient, batchId: number, rows: NormalizedContribuyente[]): Promise<void> {
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
      row.estadoContribuyente,
      row.condicionDomicilio,
      row.ubigeo,
      row.tipoVia,
      row.nombreVia,
      row.numero,
      batchId
    );
  });

  await client.query(
    `INSERT INTO contribuyentes (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       estado_contribuyente = EXCLUDED.estado_contribuyente,
       condicion_domicilio = EXCLUDED.condicion_domicilio,
       ubigeo = EXCLUDED.ubigeo,
       tipo_via = EXCLUDED.tipo_via,
       nombre_via = EXCLUDED.nombre_via,
       numero = EXCLUDED.numero,
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
    await client.query(`INSERT INTO contribuyentes_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestOptions {
  filePath?: string; // para tests / reingesta sin volver a descargar
  rucPrefix?: string; // filtro de tipo de contribuyente, ver PADRON_RUC_PREFIX
}

export interface IngestSummary {
  batchId: number;
  totalLines: number;
  skippedOtherPrefix: number;
  accepted: number;
  rejected: number;
}

export async function ingestPadron(options: IngestOptions = {}): Promise<IngestSummary> {
  const rucPrefix = options.rucPrefix ?? "20";

  let tempDir: string | undefined;
  let zipPath = options.filePath;
  if (!zipPath) {
    tempDir = await mkdtemp(path.join(tmpdir(), "padron-ruc-"));
    zipPath = path.join(tempDir, "padron_reducido_ruc.zip");
    await downloadPadronZip(zipPath);
  }

  try {
    const checksum = await checksumOf(zipPath);

    // A diferencia del resto de conectores del proyecto (que envuelven toda
    // la ingesta en una sola transacción — razonable con miles de filas),
    // acá son ~2.3M filas: una sola transacción gigante deja el progreso
    // invisible hasta el COMMIT final y, si algo falla a mitad de camino,
    // se pierde todo el trabajo. Se commitea lote por lote — el registro de
    // `raw_padron_batches` sirve igual de ancla, y una corrida interrumpida
    // deja datos parciales pero reales (re-ingerir es idempotente por
    // `ON CONFLICT (ruc) DO UPDATE`, así que no hay riesgo de duplicados).
    const batchId = await (async () => {
      const client = await pool.connect();
      try {
        return await saveRawBatch(client, checksum);
      } finally {
        client.release();
      }
    })();

    let totalLines = 0;
    let skippedOtherPrefix = 0;
    let accepted = 0;
    let rejectedCount = 0;
    let acceptBuffer: NormalizedContribuyente[] = [];
    let rejectBuffer: { raw: string[]; reason: string }[] = [];
    let isFirstLine = true;
    const startedAt = Date.now();

    for await (const line of streamPadronLines(zipPath)) {
      if (line.trim() === "") continue;
      totalLines += 1;

      if (isFirstLine) {
        isFirstLine = false;
        if (line.startsWith("RUC|")) continue; // línea de encabezado
      }

      if (!line.startsWith(rucPrefix)) {
        skippedOtherPrefix += 1;
        continue;
      }

      const fields = line.split("|");
      const normalized = normalizeContribuyenteRow(fields);

      if (isRejected(normalized)) {
        rejectBuffer.push(normalized);
        rejectedCount += 1;
      } else {
        acceptBuffer.push(normalized);
        accepted += 1;
      }

      if (totalLines % 200_000 === 0) {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`[padron] ${totalLines} líneas leídas, ${accepted} aceptadas, ${elapsedSec}s transcurridos`);
      }

      if (acceptBuffer.length >= INSERT_BATCH_SIZE) {
        await withClient((client) => insertBatch(client, batchId, acceptBuffer));
        acceptBuffer = [];
      }
      if (rejectBuffer.length >= INSERT_BATCH_SIZE) {
        await withClient((client) => insertRejectedBatch(client, batchId, rejectBuffer));
        rejectBuffer = [];
      }
    }

    await withClient((client) => insertBatch(client, batchId, acceptBuffer));
    await withClient((client) => insertRejectedBatch(client, batchId, rejectBuffer));
    await withClient((client) =>
      client.query("UPDATE raw_padron_batches SET record_count = $1 WHERE id = $2", [accepted, batchId])
    );

    return { batchId, totalLines, skippedOtherPrefix, accepted, rejected: rejectedCount };
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rucPrefix = process.env.PADRON_RUC_PREFIX;

  ingestPadron({ rucPrefix })
    .then((summary) => {
      console.log("Ingesta del padrón RUC completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
