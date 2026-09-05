import type { Pool, PoolClient } from "pg";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";

type Queryable = Pool | PoolClient;

/**
 * Re-exportada desde `@appsperu/shared-queries` (CX-08, ver
 * docs/adr/0019-alcance-workspace-utilidades-compartidas.md) — este archivo
 * era su única definición hasta que se consolidó junto con 4 copias más en
 * salud-institucional, radar-inversiones, ceplan-estrategico e infobras.
 * Se re-exporta acá para no romper `apps/radar-ejecucion/api/src/routes/benchmark.ts`,
 * que la importa desde este mismo archivo.
 */
export { LATEST_BUDGET_CTE };

export async function refreshBudgetCoverageSnapshots(db: Queryable): Promise<void> {
  await db.query(`
    INSERT INTO budget_coverage_snapshots (
      fuente, anio_fiscal, origen_cobertura, departamento, nivel_gobierno,
      fecha_corte, source_batch_ids, record_count, pia, pim, devengado
    )
    SELECT
      'MEF - Presupuesto y ejecución de gasto',
      b.anio_fiscal,
      CASE WHEN b.meta_departamento IS NULL THEN 'SEDE_EJECUTORA' ELSE 'META_DEPARTAMENTO' END,
      COALESCE(b.meta_departamento, t.departamento, 'NO_PUBLICADO'),
      e.nivel_gobierno,
      b.fecha_corte,
      jsonb_agg(DISTINCT b.source_batch_id),
      COUNT(*)::integer,
      SUM(b.pia), SUM(b.pim), SUM(b.devengado)
    FROM budget_execution b
    JOIN entities e ON e.entity_code = b.entity_code
    LEFT JOIN territories t ON t.ubigeo = e.ubigeo
    GROUP BY b.anio_fiscal,
      CASE WHEN b.meta_departamento IS NULL THEN 'SEDE_EJECUTORA' ELSE 'META_DEPARTAMENTO' END,
      COALESCE(b.meta_departamento, t.departamento, 'NO_PUBLICADO'),
      e.nivel_gobierno, b.fecha_corte
    ON CONFLICT (fuente, anio_fiscal, origen_cobertura, departamento, nivel_gobierno, fecha_corte)
    DO UPDATE SET source_batch_ids = EXCLUDED.source_batch_ids,
                  record_count = EXCLUDED.record_count,
                  pia = EXCLUDED.pia, pim = EXCLUDED.pim, devengado = EXCLUDED.devengado,
                  materializado_en = now()`);

  await db.query("UPDATE budget_coverage_snapshots SET activo = false WHERE activo = true");
  await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fuente, anio_fiscal, origen_cobertura, departamento, nivel_gobierno) id
      FROM budget_coverage_snapshots
      ORDER BY fuente, anio_fiscal, origen_cobertura, departamento, nivel_gobierno, fecha_corte DESC, id DESC
    )
    UPDATE budget_coverage_snapshots s SET activo = true
    FROM latest WHERE s.id = latest.id`);
}

export async function activeBudgetCoverage(db: Queryable, anioFiscal?: number) {
  const params: unknown[] = [];
  if (anioFiscal !== undefined) params.push(anioFiscal);
  const { rows } = await db.query(
    `SELECT origen_cobertura, departamento, nivel_gobierno, anio_fiscal, fecha_corte,
            source_batch_ids, record_count, estado_cobertura
     FROM budget_coverage_snapshots WHERE activo = true ${anioFiscal === undefined ? "" : "AND anio_fiscal = $1"}
     ORDER BY anio_fiscal DESC, origen_cobertura, departamento, nivel_gobierno`,
    params
  );
  return rows.map((row) => ({
    particion: `${row.origen_cobertura}:${row.departamento}:${row.nivel_gobierno}`,
    origenCobertura: row.origen_cobertura,
    departamento: row.departamento,
    nivelGobierno: row.nivel_gobierno,
    anioFiscal: row.anio_fiscal,
    fechaCorte: row.fecha_corte,
    lotes: row.source_batch_ids,
    registros: Number(row.record_count),
    estado: row.estado_cobertura,
  }));
}
