import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { fiscalPool } from "../db/fiscal-pool.js";
import { pool } from "../db/pool.js";

const DEFAULT_DEPARTAMENTOS = ["LA LIBERTAD"] as const;

export function parseDepartamentoScope(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_DEPARTAMENTOS];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");
}

/**
 * A diferencia de `infobras`/`identidad-fiscal`, `inhabilitaciones` y
 * `multas` no traen UBIGEO propio — el Tribunal de Contrataciones (RNP)
 * publica el reporte sin dirección, solo RUC. El recorte territorial real
 * de esta app es un cruce: RUC sancionado -> domicilio fiscal declarado en
 * `identidad-fiscal` (mismo patrón que `routes/crossref.ts`, que cruza por
 * RUC exacto contra `compras-publicas`). "Cobertura por departamento" acá
 * significa "proveedores sancionados con domicilio fiscal en ese
 * departamento", no una partición de la fuente original.
 */
export async function materializeProveedoresSancionadosCoverage(
  departamentos: readonly string[],
  batchId?: number
): Promise<{ batchId: number; jurisdictions: number }> {
  const selectedBatch =
    batchId ??
    (await pool.query<{ batch_id: number }>("SELECT MAX(id) AS batch_id FROM raw_sanciones_batches")).rows[0]
      ?.batch_id;
  if (!selectedBatch) throw new Error("No existe un lote de sanciones persistido para materializar cobertura.");

  const { rows: raw } = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM raw_sanciones_batches WHERE id=$1",
    [selectedBatch]
  );
  if (!raw[0]) throw new Error(`No existe raw_sanciones_batches ${selectedBatch}.`);

  const { rows: rucRows } = await pool.query<{ ruc: string }>(
    `SELECT DISTINCT ruc FROM inhabilitaciones WHERE source_batch_id=$1
     UNION
     SELECT DISTINCT ruc FROM multas WHERE source_batch_id=$1`,
    [selectedBatch]
  );
  const totalRucsNacional = rucRows.length;
  const rucs = rucRows.map((row) => row.ruc);

  const { rows: jurisdictionRows } = await ejecucionPool.query<{ code: string; name: string }>(
    "SELECT code, name FROM territorial_jurisdictions WHERE name = ANY($1)",
    [departamentos]
  );
  if (jurisdictionRows.length !== departamentos.length) {
    const found = new Set(jurisdictionRows.map((row) => row.name));
    const missing = departamentos.filter((name) => !found.has(name));
    throw new Error(`Jurisdicción(es) no encontradas en territorial_jurisdictions: ${missing.join(", ")}`);
  }

  const { rows: domicilioRows } =
    rucs.length > 0
      ? await fiscalPool.query<{ code: string; count: string }>(
          `SELECT LEFT(ubigeo,2) AS code, COUNT(1)::text AS count
             FROM contribuyentes
            WHERE ruc = ANY($1) AND ubigeo IS NOT NULL AND LEFT(ubigeo,2) = ANY($2)
            GROUP BY LEFT(ubigeo,2)`,
          [rucs, jurisdictionRows.map((row) => row.code)]
        )
      : { rows: [] as { code: string; count: string }[] };
  const byCode = new Map(domicilioRows.map((row) => [row.code, Number(row.count)]));

  for (const jurisdiction of jurisdictionRows) {
    const normalizedRecords = byCode.get(jurisdiction.code) ?? 0;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       VALUES ('proveedores-sancionados','RNP_TRIBUNAL_CONTRATACIONES',$1,true,$2,$2,$2,0,
              CASE WHEN $2=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
              $3,now(),$4,$5::jsonb)`,
      [
        jurisdiction.code,
        normalizedRecords,
        `proveedores-sancionados:${selectedBatch}:${raw[0].checksum}`,
        `Reporte RNP (Tribunal de Contrataciones) sin UBIGEO propio — nacional, ${totalRucsNacional} RUC ` +
          "sancionados/inhabilitados distintos. El recorte departamental es un cruce por RUC exacto contra " +
          "el domicilio fiscal declarado en identidad-fiscal (padrón SUNAT), no una partición de la fuente " +
          "original. No cubre proveedores sin RUC en el padrón (persona natural sin RUC, RUC dado de baja).",
        JSON.stringify(["identidad-fiscal"]),
      ]
    );
  }

  return { batchId: selectedBatch, jurisdictions: jurisdictionRows.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = parseDepartamentoScope(process.env.PROVEEDORES_SANCIONADOS_DEPARTAMENTOS);
  const batchId = process.env.PROVEEDORES_SANCIONADOS_BATCH_ID
    ? Number(process.env.PROVEEDORES_SANCIONADOS_BATCH_ID)
    : undefined;
  materializeProveedoresSancionadosCoverage(departamentos, batchId)
    .then((summary) => console.log("Cobertura proveedores-sancionados materializada:", summary))
    .finally(async () => {
      await Promise.all([pool.end(), fiscalPool.end(), ejecucionPool.end()]);
    })
    .catch((error) => {
      console.error("No se pudo materializar cobertura proveedores-sancionados:", error);
      process.exitCode = 1;
    });
}
