import { describe, expect, it } from "vitest";
import { computeBenchmark, type CohortMember, type CohortRule } from "../cohorts/rules.js";

const rule: CohortRule = {
  id: "test-rule",
  version: 1,
  nivelGobierno: "GOBIERNO_LOCAL",
  funcion: "*",
  minN: 3,
  descripcion: "Regla de prueba",
};

function cohort(overrides: Partial<CohortMember>[] = []): CohortMember[] {
  const base: CohortMember[] = [
    { entityCode: "A", pim: 1000, devengado: 500 }, // 50%
    { entityCode: "B", pim: 1000, devengado: 900 }, // 90%
    { entityCode: "C", pim: 1000, devengado: 100 }, // 10%
    { entityCode: "D", pim: 1000, devengado: 700 }, // 70%
  ];
  return base.map((m, i) => ({ ...m, ...overrides[i] }));
}

describe("computeBenchmark", () => {
  it("returns datos_insuficientes when cohort size is below minN", () => {
    const result = computeBenchmark("A", cohort().slice(0, 2), rule);
    expect(result.status).toBe("datos_insuficientes");
    if (result.status === "datos_insuficientes") {
      expect(result.n).toBe(2);
      expect(result.minRequerido).toBe(3);
    }
  });

  it("returns datos_insuficientes when the target entity is not in the cohort", () => {
    const result = computeBenchmark("ZZZ", cohort(), rule);
    expect(result.status).toBe("datos_insuficientes");
  });

  it("computes percentile rank and median when cohort is sufficient", () => {
    const result = computeBenchmark("A", cohort(), rule);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.n).toBe(4);
      // A's avance (50%) beats only C (10%) among the other three -> 1/4 = 25%
      expect(result.percentil).toBe(25);
      expect(result.medianaAvancePct).toBe(60); // median of [10,50,70,90]
      expect(result.criterios).toContain("test-rule");
    }
  });

  it("never returns a percentile for a cohort below minN even with a valid target", () => {
    const small = cohort().slice(0, 2);
    const result = computeBenchmark("A", small, rule);
    expect(result).not.toHaveProperty("percentil");
  });
});
