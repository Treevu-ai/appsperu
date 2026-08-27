import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { pool } from "../db/pool.js";

type Counts = { departamento: string; normalized_records: string; rejected_records: string };

const DEFAULT_DEPARTAMENTOS = ["LA LIBERTAD"] as const;

export function parseDepartamentoScope(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_DEPARTAMENTOS];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");
}

export async function materializeActividadAgrariaCoverage(
  departamentos: readonly string[],
  batchId?: number
): Promise<{ batchId: number; jurisdictions: number }> {
  const selectedBatch =
    batchId ??
    (await pool.query<{ batch_id: number }>("SELECT MAX(id) AS batch_id FROM raw_midagri_batches")).rows[0]
      ?.batch_id;
  if (!selectedBatch) throw new Error("No existe un lote MIDAGRI persistido para materializar cobertura.");

  const { rows: raw } = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM raw_midagri_batches WHERE id=$1",
    [selectedBatch]
  );
  if (!raw[0]) throw new Error(`No existe raw_midagri_batches ${selectedBatch}.`);

  const { rows } = await pool.query<Counts>(
    `WITH normalized AS (
       SELECT departamento, COUNT(1)::text AS normalized_records
         FROM agricultural_wage
        WHERE source_batch_id=$1 AND departamento = ANY($2)
        GROUP BY departamento
     ), rejected AS (
       SELECT UPPER(TRIM(raw_row->>'Región')) AS departamento, COUNT(1)::text AS rejected_records
         FROM agricultural_wage_rejected
        WHERE source_batch_id=$1 AND UPPER(TRIM(raw_row->>'Región')) = ANY($2)
        GROUP BY UPPER(TRIM(raw_row->>'Región'))
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
       SELECT 'actividad-agraria','MIDAGRI_JORNAL_AGRICOLA',code,true,$2,$3,$3,$4,
              CASE WHEN $2=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
              $5,now(),$6,'[]'::jsonb
         FROM territorial_jurisdictions WHERE name=$1`,
      [
        departamento,
        sourceRecords,
        normalizedRecords,
        rejectedRecords,
        `actividad-agraria:${selectedBatch}:${raw[0].checksum}`,
        "Serie MIDAGRI de jornal agrícola promedio mensual por departamento (recurso oficial vía API " +
          "de datos abiertos). Cobertura completa significa todos los meses expuestos por la fuente para " +
          "ese departamento, no un dato de ejecución de gasto ni de actividad agraria total.",
      ]
    );
  }

  return { batchId: selectedBatch, jurisdictions: departamentos.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = parseDepartamentoScope(process.env.ACTIVIDAD_AGRARIA_DEPARTAMENTOS);
  const batchId = process.env.ACTIVIDAD_AGRARIA_BATCH_ID ? Number(process.env.ACTIVIDAD_AGRARIA_BATCH_ID) : undefined;
  materializeActividadAgrariaCoverage(departamentos, batchId)
    .then((summary) => console.log("Cobertura actividad-agraria materializada:", summary))
    .finally(async () => {
      await Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((error) => {
      console.error("No se pudo materializar cobertura actividad-agraria:", error);
      process.exitCode = 1;
    });
}
