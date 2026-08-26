/** Misma semántica que radar-ejecucion `LATEST_BUDGET_CTE` — última versión por clave lógica. */
export const LATEST_BUDGET_CTE = `
  WITH latest_budget AS (
    SELECT DISTINCT ON (
      b.entity_code, b.funcion, b.anio_fiscal,
      COALESCE(b.meta_departamento, ''), COALESCE(b.generica, '')
    ) b.*
    FROM budget_execution b
    ORDER BY b.entity_code, b.funcion, b.anio_fiscal,
             COALESCE(b.meta_departamento, ''), COALESCE(b.generica, ''),
             b.fecha_corte DESC, b.id DESC
  )`;
