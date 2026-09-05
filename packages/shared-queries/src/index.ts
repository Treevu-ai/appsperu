/**
 * Selecciona la última versión de cada observación lógica de
 * `budget_execution` (radar-ejecucion). No usa un MAX global: una cobertura
 * regional/local puede tener un corte distinto de la cobertura nacional
 * dirigida al mismo departamento.
 *
 * Consolidado de 5 copias idénticas que existían en `radar-ejecucion`
 * (origen), `salud-institucional`, `radar-inversiones`, `ceplan-estrategico`
 * e `infobras` — ver docs/adr/0019-alcance-workspace-utilidades-compartidas.md
 * (CX-08). Es texto SQL puro, sin dependencias de runtime: cualquier app con
 * un pool de conexión a la base de `radar-ejecucion` puede usarla tal cual,
 * como prefijo de su propia query (`` `${LATEST_BUDGET_CTE} SELECT ...` ``).
 */
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
