import { describe, expect, it } from "vitest";
import { LATEST_BUDGET_CTE } from "../index.js";

describe("LATEST_BUDGET_CTE", () => {
  it("names the CTE latest_budget", () => {
    expect(LATEST_BUDGET_CTE).toMatch(/WITH latest_budget AS/);
  });

  it("deduplicates by entity_code, funcion, anio_fiscal and the two nullable dimensions", () => {
    expect(LATEST_BUDGET_CTE).toMatch(
      /SELECT DISTINCT ON \(\s*b\.entity_code, b\.funcion, b\.anio_fiscal,\s*COALESCE\(b\.meta_departamento, ''\), COALESCE\(b\.generica, ''\)\s*\)/
    );
  });

  it("reads from budget_execution", () => {
    expect(LATEST_BUDGET_CTE).toMatch(/FROM budget_execution b/);
  });

  it("orders by fecha_corte DESC then id DESC to keep the latest re-ingest, not just the latest id", () => {
    expect(LATEST_BUDGET_CTE).toMatch(/ORDER BY[\s\S]*b\.fecha_corte DESC, b\.id DESC/);
  });
});
