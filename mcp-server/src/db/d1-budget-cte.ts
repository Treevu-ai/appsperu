/*
 * Versión D1-compatible de LATEST_BUDGET_CTE.
 *
 * Postgres usaba DISTINCT ON (entity_code, funcion, anio_fiscal, ...) ORDER BY ... fecha_corte DESC, id DESC
 * para dedupar dejando solo el último corte por combinación. SQLite (D1) no soporta
 * DISTINCT ON, así que se usa ROW_NUMBER() OVER PARTITION BY ... ORDER BY ... DESC
 * y se filtra WHERE rn = 1.
 *
 * La conversión se documenta en docs/PLAN_MIGRACION_MCP_WORKER.md → sección 3.
 */
export const LATEST_BUDGET_CTE = `
  WITH latest_budget AS (
    SELECT b.*,
           ROW_NUMBER() OVER (
             PARTITION BY b.entity_code, b.funcion, b.anio_fiscal,
                          COALESCE(b.meta_departamento, ''), COALESCE(b.generica, '')
             ORDER BY b.fecha_corte DESC, b.id DESC
           ) AS rn
    FROM budget_execution b
  )`;

/**
 * Wrapper que agrega el `WHERE rn = 1` filtro después del CTE.
 * Uso: `${LATEST_BUDGET_CTE_WHERE} SELECT ... FROM latest_budget WHERE rn = 1 ...`
 */
export const LATEST_BUDGET_CTE_WHERE = `${LATEST_BUDGET_CTE}
 WHERE rn = 1`;
