/*
 * `LATEST_BUDGET_CTE` en dialecto Postgres, para los handlers del MCP Worker.
 *
 * La fuente canónica es `packages/shared-queries` —ADR-0019 (CX-08) la creó
 * para eliminar 5 copias divergentes del mismo CTE, y 12 apps la consumen.
 * El MCP no importa ese paquete a propósito: `mcp-server/tsconfig.json` fija
 * `rootDir: "src"`, así que un import fuera de `src` rompe el `tsc` que
 * genera el bundle del Worker. Como el CTE es texto SQL puro sin dependencias
 * de runtime, la alternativa es duplicarlo y blindarlo con un test que
 * compare ambas cadenas (ver `__tests__/latest-budget.test.ts`). Si divergen,
 * ese test falla.
 *
 * Deduplica dejando el último corte por combinación, sin un MAX global: una
 * cobertura regional puede tener un corte distinto de la nacional dirigida al
 * mismo departamento.
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
