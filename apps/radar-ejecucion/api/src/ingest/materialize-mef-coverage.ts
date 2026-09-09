import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { coverageRowsFromMefSnapshots, type MefBudgetSnapshot } from "../coverage/mef-territorial.js";
import { DEPARTAMENTO_UBIGEO_PREFIJO } from "./mef-section-bounds.js";

/**
 * CT-22 (2026-09-09): primer materializador de cobertura para radar-ejecucion/MEF.
 * No existía ninguno — `mef-connector.ts` nunca escribió en `territorial_coverage`,
 * así que la app quedaba `BLOQUEADA` en el verificador aunque el dato ya existiera
 * en `budget_execution`. Reusa `coverageRowsFromMefSnapshots()` (código ya
 * existente, nunca conectado) para decidir el estado por fuente.
 *
 * `budget_execution.source_batch_id` referencia un único lote (el último de la
 * corrida completa GR+GL de ese departamento) — no hay un lote por sección
 * persistido en esta tabla. La atribución real de nivel de gobierno se hace vía
 * `entities.nivel_gobierno` + prefijo UBIGEO del departamento (GR/GL) o
 * `budget_execution.meta_departamento` (GN, que sí guarda el departamento
 * directamente en la fila).
 */

async function buildSedeEjecutoraSnapshot(
  departamento: string,
  nivelGobierno: "GOBIERNOS REGIONALES" | "GOBIERNOS LOCALES"
): Promise<MefBudgetSnapshot | null> {
  const ubigeoPrefijo = DEPARTAMENTO_UBIGEO_PREFIJO[departamento as keyof typeof DEPARTAMENTO_UBIGEO_PREFIJO];
  if (!ubigeoPrefijo) throw new Error(`Departamento fuera del catálogo territorial: ${departamento}`);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, MAX(b.fecha_corte) AS max_corte, ARRAY_AGG(DISTINCT b.source_batch_id) AS batch_ids
     FROM budget_execution b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE e.nivel_gobierno = $1 AND e.ubigeo LIKE $2 AND b.meta_departamento IS NULL`,
    [nivelGobierno, `${ubigeoPrefijo}%`]
  );
  const registros = rows[0].n as number;
  const batchIds = (rows[0].batch_ids as (number | null)[] | null)?.filter((id): id is number => id !== null) ?? [];
  if (batchIds.length === 0) return null;

  const fechaCorte = rows[0].max_corte
    ? new Date(rows[0].max_corte as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return { origenCobertura: "SEDE_EJECUTORA", departamento, nivelGobierno, fechaCorte, lotes: batchIds, registros };
}

async function buildMetaDepartamentoSnapshot(departamento: string): Promise<MefBudgetSnapshot | null> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, MAX(fecha_corte) AS max_corte, ARRAY_AGG(DISTINCT source_batch_id) AS batch_ids
     FROM budget_execution WHERE meta_departamento = $1`,
    [departamento]
  );
  const registros = rows[0].n as number;
  const batchIds = (rows[0].batch_ids as (number | null)[] | null)?.filter((id): id is number => id !== null) ?? [];
  if (batchIds.length === 0) return null;

  const fechaCorte = rows[0].max_corte
    ? new Date(rows[0].max_corte as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return { origenCobertura: "META_DEPARTAMENTO", departamento, nivelGobierno: "GOBIERNO NACIONAL", fechaCorte, lotes: batchIds, registros };
}

export async function materializeMefCoverage(departamentos: readonly string[]): Promise<void> {
  for (const departamentoRaw of departamentos) {
    const departamento = departamentoRaw.trim().toUpperCase();
    const snapshots: MefBudgetSnapshot[] = [];

    const gr = await buildSedeEjecutoraSnapshot(departamento, "GOBIERNOS REGIONALES");
    if (gr) snapshots.push(gr);
    const gl = await buildSedeEjecutoraSnapshot(departamento, "GOBIERNOS LOCALES");
    if (gl) snapshots.push(gl);
    const gn = await buildMetaDepartamentoSnapshot(departamento);
    if (gn) snapshots.push(gn);

    const rows = coverageRowsFromMefSnapshots({ departamento, snapshots });
    for (const row of rows) {
      await pool.query(
        `INSERT INTO territorial_coverage
          (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
         SELECT $1,$2,code,$3,$4,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb
         FROM territorial_jurisdictions WHERE name=$11`,
        [
          row.appName,
          row.sourceName,
          row.requested,
          row.sourceRecords,
          row.persistedRecords,
          row.rejectedRecords,
          row.completeness,
          row.sourceBatchRef,
          row.cutoffAt,
          row.restriction,
          row.departamento,
        ]
      );
    }
    console.log(JSON.stringify({ departamento, rows: rows.map((row) => ({ source: row.sourceName, completeness: row.completeness, persisted: row.persistedRecords })) }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = (process.env.MEF_COVERAGE_DEPARTAMENTOS ?? "LA LIBERTAD,AREQUIPA")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  materializeMefCoverage(departamentos)
    .then(() => console.log(JSON.stringify({ status: "COMPLETE", departamentos })))
    .catch((error) => {
      console.error("Materialización de cobertura MEF falló:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
