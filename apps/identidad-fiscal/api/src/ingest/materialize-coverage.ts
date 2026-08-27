import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { pool } from "../db/pool.js";

type Counts = { code: string; normalized_records: string; rejected_records: string };

const DEFAULT_DEPARTAMENTOS = ["LA LIBERTAD"] as const;

export function parseDepartamentoScope(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_DEPARTAMENTOS];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");
}

export async function materializeIdentidadFiscalCoverage(
  departamentos: readonly string[],
  batchId?: number
): Promise<{ batchId: number; jurisdictions: number }> {
  const selectedBatch =
    batchId ??
    (await pool.query<{ batch_id: number }>("SELECT MAX(id) AS batch_id FROM raw_padron_batches")).rows[0]?.batch_id;
  if (!selectedBatch) throw new Error("No existe un lote del padrón RUC persistido para materializar cobertura.");

  const { rows: raw } = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM raw_padron_batches WHERE id=$1",
    [selectedBatch]
  );
  if (!raw[0]) throw new Error(`No existe raw_padron_batches ${selectedBatch}.`);

  const { rows: jurisdictionRows } = await ejecucionPool.query<{ code: string; name: string }>(
    "SELECT code, name FROM territorial_jurisdictions WHERE name = ANY($1)",
    [departamentos]
  );
  if (jurisdictionRows.length !== departamentos.length) {
    const found = new Set(jurisdictionRows.map((row) => row.name));
    const missing = departamentos.filter((name) => !found.has(name));
    throw new Error(`Jurisdicción(es) no encontradas en territorial_jurisdictions: ${missing.join(", ")}`);
  }

  const { rows } = await pool.query<Counts>(
    `WITH normalized AS (
       SELECT LEFT(ubigeo,2) AS code, COUNT(1)::text AS normalized_records
         FROM contribuyentes
        WHERE source_batch_id=$1 AND ubigeo IS NOT NULL AND LEFT(ubigeo,2) = ANY($2)
        GROUP BY LEFT(ubigeo,2)
     ), rejected AS (
       SELECT LEFT(raw_row->>4,2) AS code, COUNT(1)::text AS rejected_records
         FROM contribuyentes_rejected
        WHERE source_batch_id=$1 AND LEFT(raw_row->>4,2) = ANY($2)
        GROUP BY LEFT(raw_row->>4,2)
     )
     SELECT COALESCE(n.code,r.code) AS code,
            COALESCE(n.normalized_records,'0') AS normalized_records,
            COALESCE(r.rejected_records,'0') AS rejected_records
       FROM normalized n FULL OUTER JOIN rejected r USING (code)`,
    [selectedBatch, jurisdictionRows.map((row) => row.code)]
  );
  const counts = new Map(rows.map((row) => [row.code, row]));

  for (const jurisdiction of jurisdictionRows) {
    const current = counts.get(jurisdiction.code);
    const normalizedRecords = Number(current?.normalized_records ?? 0);
    const rejectedRecords = Number(current?.rejected_records ?? 0);
    const sourceRecords = normalizedRecords + rejectedRecords;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       VALUES ('identidad-fiscal','SUNAT_PADRON_RUC',$1,true,$2,$3,$3,$4,
              CASE WHEN $3=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
              $5,now(),$6,'[]'::jsonb)`,
      [
        jurisdiction.code,
        sourceRecords,
        normalizedRecords,
        rejectedRecords,
        `identidad-fiscal:${selectedBatch}:${raw[0].checksum}`,
        "Padrón Reducido RUC (SUNAT), solo contribuyentes con RUC prefijo 20 (PADRON_RUC_PREFIX). " +
          "Recorte territorial por prefijo departamental de UBIGEO — domicilio fiscal declarado, no " +
          "prueba de ejecución ni presencia operativa. No certifica cobertura nacional completa de " +
          "otros prefijos de RUC (10, 15, 17).",
      ]
    );
  }

  return { batchId: selectedBatch, jurisdictions: jurisdictionRows.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = parseDepartamentoScope(process.env.IDENTIDAD_FISCAL_DEPARTAMENTOS);
  const batchId = process.env.IDENTIDAD_FISCAL_BATCH_ID ? Number(process.env.IDENTIDAD_FISCAL_BATCH_ID) : undefined;
  materializeIdentidadFiscalCoverage(departamentos, batchId)
    .then((summary) => console.log("Cobertura identidad-fiscal materializada:", summary))
    .finally(async () => {
      await Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((error) => {
      console.error("No se pudo materializar cobertura identidad-fiscal:", error);
      process.exitCode = 1;
    });
}
