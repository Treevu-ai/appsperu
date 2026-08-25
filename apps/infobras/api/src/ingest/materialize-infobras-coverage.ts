import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { pool } from "../db/pool.js";
import { parseDepartamentoScope } from "./infobras-connector.js";

type Counts = { departamento: string; normalized_records: string; rejected_records: string };

export async function materializeInfobrasCoverage(departamentos: readonly string[], batchId?: number): Promise<{ batchId: number; jurisdictions: number }> {
  const selectedBatch = batchId ?? (await pool.query<{ batch_id: number }>(
    "SELECT MAX(source_batch_id) AS batch_id FROM public_works"
  )).rows[0]?.batch_id;
  if (!selectedBatch) throw new Error("No existe un lote INFOBRAS persistido para materializar cobertura.");
  const { rows: raw } = await pool.query<{ record_count: string; checksum: string }>(
    "SELECT record_count::text, checksum FROM raw_infobras_batches WHERE id=$1",
    [selectedBatch]
  );
  if (!raw[0]) throw new Error(`No existe raw_infobras_batch ${selectedBatch}.`);
  const { rows } = await pool.query<Counts>(
    `WITH normalized AS (
       SELECT departamento, COUNT(1)::text AS normalized_records
         FROM public_works
        WHERE source_batch_id=$1 AND departamento = ANY($2)
        GROUP BY departamento
     ), rejected AS (
       SELECT UPPER(TRIM(raw_row->>29)) AS departamento, COUNT(1)::text AS rejected_records
         FROM public_works_rejected
        WHERE source_batch_id=$1 AND UPPER(TRIM(raw_row->>29)) = ANY($2)
        GROUP BY UPPER(TRIM(raw_row->>29))
     )
     SELECT COALESCE(n.departamento,r.departamento) AS departamento,
            COALESCE(n.normalized_records,'0') AS normalized_records,
            COALESCE(r.rejected_records,'0') AS rejected_records
       FROM normalized n FULL OUTER JOIN rejected r USING (departamento)`,
    [selectedBatch, departamentos]
  );
  const counts = new Map(rows.map((row) => [row.departamento, row]));
  for (const departamento of departamentos) {
    const current = counts.get(departamento);
    const normalizedRecords = Number(current?.normalized_records ?? 0);
    const rejectedRecords = Number(current?.rejected_records ?? 0);
    const sourceRecords = normalizedRecords + rejectedRecords;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'infobras','INFOBRAS_OBRAS_PUBLICAS',code,true,$2,$3,$3,$4,
              CASE WHEN $2=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
              $5,now(),$6,'[]'::jsonb
         FROM territorial_jurisdictions WHERE name=$1`,
      [departamento, sourceRecords, normalizedRecords, rejectedRecords,
        `infobras:${selectedBatch}:${raw[0].checksum}`,
        `XLSX nacional recorrido y lote ${selectedBatch} persistido; este corte solo cubre el subconjunto explícito solicitado. Fuera de esa lista no se afirma cobertura.`]
    );
  }
  return { batchId: selectedBatch, jurisdictions: departamentos.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = parseDepartamentoScope(process.env.INFOBRAS_DEPARTAMENTOS);
  const batchId = process.env.INFOBRAS_BATCH_ID ? Number(process.env.INFOBRAS_BATCH_ID) : undefined;
  materializeInfobrasCoverage(departamentos, batchId)
    .then((summary) => console.log("Cobertura INFOBRAS materializada:", summary))
    .finally(async () => { await Promise.all([pool.end(), ejecucionPool.end()]); })
    .catch((error) => { console.error("No se pudo materializar cobertura INFOBRAS:", error); process.exitCode = 1; });
}
