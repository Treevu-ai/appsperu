import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { pool } from "../db/pool.js";
import { DEFAULT_TERRITORIAL_SCOPE, ingestInvestments, type IngestOptions } from "./invierte-connector.js";

const FILE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv";
const DEFAULT_CHUNK_BYTES = 50 * 1024 * 1024;

async function sourceLength(): Promise<number> {
  const response = await fetch(FILE_URL, { method: "HEAD" });
  if (!response.ok) throw new Error(`MEF devolvió ${response.status} al consultar el tamaño del CSV de inversiones.`);
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

export async function materializeVerifiedCoverage(batchIds: readonly number[], runId: string, contentLength: number): Promise<void> {
  const sourceBatchRefs = batchIds.map((id) => `invierte:${id}`);
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
        AND source_name='INVIERTE_DETALLE_INVERSIONES'
        AND source_batch_ref = ANY($1)
      GROUP BY jurisdiction_code`,
    [sourceBatchRefs]
  );
  const aggregate = new Map(rows.map((row) => [row.jurisdiction_code, row]));
  for (const departamento of DEFAULT_TERRITORIAL_SCOPE) {
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
       VALUES ('radar-inversiones','INVIERTE_DETALLE_INVERSIONES',$1,true,$2,$3,$4,$5,
               CASE WHEN $2=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
               $6,now(),$7,'[]'::jsonb)`,
      [result.code, sourceRecords, normalizedRecords, persistedRecords, rejectedRecords,
        `invierte-full:${runId}`,
        `CSV público recorrido por HTTP Range continuo desde byte 0 hasta ${contentLength - 1}; ${batchIds.length} rangos sin huecos.`]
    );
  }
}

export async function ingestFullInvestments(options: Pick<IngestOptions, "departamentos"> & { chunkBytes?: number } = {}): Promise<{ runId: string; contentLength: number; batchIds: number[] }> {
  const contentLength = await sourceLength();
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new Error("chunkBytes debe ser entero positivo.");
  const runId = randomUUID();
  const batchIds: number[] = [];
  const departamentos = options.departamentos ?? [...DEFAULT_TERRITORIAL_SCOPE];
  for (let startByte = 0; startByte < contentLength; startByte += chunkBytes) {
    const maxBytes = Math.min(chunkBytes, contentLength - startByte);
    const summary = await ingestInvestments({ startByte, maxBytes, departamentos });
    batchIds.push(summary.batchId);
    console.log(JSON.stringify({ runId, startByte, endByte: startByte + maxBytes - 1, batchId: summary.batchId, accepted: summary.accepted, rejected: summary.rejected }));
  }
  await materializeVerifiedCoverage(batchIds, runId, contentLength);
  return { runId, contentLength, batchIds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunkBytes = positiveInteger(process.env.INVIERTE_CHUNK_BYTES, DEFAULT_CHUNK_BYTES);
  const existingBatchIds = process.env.INVIERTE_BATCH_IDS?.split(",").map(Number).filter(Number.isInteger);
  if (existingBatchIds?.length) {
    sourceLength()
      .then(async (contentLength) => {
        await materializeVerifiedCoverage(existingBatchIds, process.env.INVIERTE_RUN_ID ?? randomUUID(), contentLength);
        console.log("Cobertura de Invierte consolidada desde lotes existentes:", { batchIds: existingBatchIds, contentLength });
      })
      .finally(async () => { await Promise.all([pool.end(), ejecucionPool.end()]); })
      .catch((error) => { console.error("No se pudo consolidar Invierte:", error); process.exitCode = 1; });
  } else {
  ingestFullInvestments({ departamentos: [...DEFAULT_TERRITORIAL_SCOPE], chunkBytes })
    .then((summary) => console.log("Ingesta completa de Invierte verificada:", summary))
    .finally(async () => { await Promise.all([pool.end(), ejecucionPool.end()]); })
    .catch((error) => { console.error("Ingesta completa de Invierte falló:", error); process.exitCode = 1; });
  }
}
