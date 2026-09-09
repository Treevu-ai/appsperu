import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { pool } from "../db/pool.js";
import { DEFAULT_TERRITORIAL_SCOPE } from "./invierte-connector.js";
import { ingestDeactivatedInvestments, type DeactivatedIngestOptions } from "./invierte-desactivadas-connector.js";

const FILE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/INVERSIONES_DESACTIVADAS.csv";
const DEFAULT_CHUNK_BYTES = 50 * 1024 * 1024;
const SOURCE_NAME = "INVIERTE_INVERSIONES_DESACTIVADAS";

/** Mismo patrón que `run-invierte-full.ts` — recorrido sin huecos, verificado por Content-Length. */
async function sourceLength(): Promise<number> {
  const response = await fetch(FILE_URL, { method: "HEAD" });
  if (!response.ok) throw new Error(`MEF devolvió ${response.status} al consultar el tamaño del CSV de inversiones desactivadas.`);
  const length = Number(response.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) throw new Error("MEF no expuso Content-Length válido; no se puede demostrar continuidad.");
  if (response.headers.get("accept-ranges")?.toLowerCase() !== "bytes") {
    throw new Error("MEF no confirmó soporte HTTP Range; no se puede ejecutar una descarga reanudable verificable.");
  }
  return length;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error("INVIERTE_CHUNK_BYTES debe ser un entero positivo.");
  return value;
}

async function materializeVerifiedCoverage(batchIds: readonly number[], runId: string, contentLength: number, departamentos: readonly string[] = DEFAULT_TERRITORIAL_SCOPE): Promise<void> {
  const sourceBatchRefs = batchIds.map((id) => `invierte-desactivadas:${id}`);
  const { rows } = await ejecucionPool.query<{
    jurisdiction_code: string;
    source_records: string;
    normalized_records: string;
    persisted_records: string;
    rejected_records: string;
  }>(
    `SELECT jurisdiction_code,
            SUM(source_records)::text AS source_records,
            SUM(normalized_records)::text AS normalized_records,
            SUM(persisted_records)::text AS persisted_records,
            SUM(rejected_records)::text AS rejected_records
       FROM territorial_coverage
      WHERE app_name='radar-inversiones'
        AND source_name=$1
        AND source_batch_ref = ANY($2)
      GROUP BY jurisdiction_code`,
    [SOURCE_NAME, sourceBatchRefs]
  );
  const aggregate = new Map(rows.map((row) => [row.jurisdiction_code, row]));
  for (const departamento of departamentos) {
    const { rows: jurisdictions } = await ejecucionPool.query<{ code: string }>(
      "SELECT code FROM territorial_jurisdictions WHERE name=$1",
      [departamento]
    );
    const result = jurisdictions[0];
    if (!result) throw new Error(`Jurisdicción central ausente: ${departamento}`);
    const counts = aggregate.get(result.code);
    const sourceRecords = Number(counts?.source_records ?? 0);
    const normalizedRecords = Number(counts?.normalized_records ?? 0);
    const persistedRecords = Number(counts?.persisted_records ?? 0);
    const rejectedRecords = Number(counts?.rejected_records ?? 0);
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       VALUES ('radar-inversiones',$1,$2,true,$3,$4,$5,$6,
               CASE WHEN $3=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
               $7,now(),$8,'[]'::jsonb)`,
      [SOURCE_NAME, result.code, sourceRecords, normalizedRecords, persistedRecords, rejectedRecords,
        `invierte-desactivadas-full:${runId}`,
        `CSV público (inversiones desactivadas) recorrido por HTTP Range continuo desde byte 0 hasta ${contentLength - 1}; ${batchIds.length} rangos sin huecos.`]
    );
  }
}

export async function ingestFullDeactivatedInvestments(
  options: Pick<DeactivatedIngestOptions, "departamentos"> & { chunkBytes?: number } = {}
): Promise<{ runId: string; contentLength: number; batchIds: number[] }> {
  const contentLength = await sourceLength();
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new Error("chunkBytes debe ser entero positivo.");
  const runId = randomUUID();
  const batchIds: number[] = [];
  const departamentos = options.departamentos ?? [...DEFAULT_TERRITORIAL_SCOPE];
  for (let startByte = 0; startByte < contentLength; startByte += chunkBytes) {
    const maxBytes = Math.min(chunkBytes, contentLength - startByte);
    const summary = await ingestDeactivatedInvestments({ startByte, maxBytes, departamentos });
    batchIds.push(summary.batchId);
    console.log(JSON.stringify({ runId, startByte, endByte: startByte + maxBytes - 1, batchId: summary.batchId, accepted: summary.accepted, rejected: summary.rejected }));
  }
  await materializeVerifiedCoverage(batchIds, runId, contentLength, departamentos);
  return { runId, contentLength, batchIds };
}

function resolveInvierteDepartamentosFromEnv(): readonly string[] {
  const raw = process.env.INVIERTE_DEPARTAMENTOS;
  if (!raw) return [...DEFAULT_TERRITORIAL_SCOPE];
  return raw.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunkBytes = positiveInteger(process.env.INVIERTE_CHUNK_BYTES, DEFAULT_CHUNK_BYTES);
  ingestFullDeactivatedInvestments({ departamentos: resolveInvierteDepartamentosFromEnv(), chunkBytes })
    .then((summary) => console.log("Ingesta completa de inversiones desactivadas verificada:", summary))
    .finally(async () => { await Promise.all([pool.end(), ejecucionPool.end()]); })
    .catch((error) => { console.error("Ingesta completa de inversiones desactivadas falló:", error); process.exitCode = 1; });
}
