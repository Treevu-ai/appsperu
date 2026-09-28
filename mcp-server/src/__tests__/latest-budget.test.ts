import { describe, expect, it } from "vitest";
import { LATEST_BUDGET_CTE as CTE_MCP } from "../db/latest-budget.js";
import { LATEST_BUDGET_CTE as CTE_CANONICO } from "../../../packages/shared-queries/src/index.js";

/**
 * `mcp-server/src/db/latest-budget.ts` duplica el CTE canónico de
 * `packages/shared-queries` porque el `rootDir: src` de mcp-server impide
 * importarlo sin romper el bundle del Worker. Esta es la red que hace segura
 * esa duplicación: si alguien edita uno y no el otro, el test falla.
 *
 * ADR-0019 (CX-08) creó el CTE compartido justamente para eliminar 5 copias
 * divergentes; no vamos a reintroducir la sexta.
 */
describe("LATEST_BUDGET_CTE del MCP no diverge del canónico", () => {
  it("es la misma cadena SQL que packages/shared-queries", () => {
    expect(CTE_MCP).toBe(CTE_CANONICO);
  });
});
