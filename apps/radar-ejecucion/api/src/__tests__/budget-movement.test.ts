import { describe, expect, it } from "vitest";
import { summarizeBudgetMovement } from "../sector/movement.js";

describe("movimiento presupuestal", () => {
  it("keeps national destination and regional execution in separate universes", () => {
    const summary = summarizeBudgetMovement([
      { sectorId: "TRANSPORTE", sector: "Transporte", entidad: "MTC", reglaTerritorial: "META_DEPARTAMENTO", pia: 100, pim: 120, devengado: 60, cortesUsados: ["2026-08-24"] },
      { sectorId: "TRANSPORTE", sector: "Transporte", entidad: "GORE", reglaTerritorial: "SEDE_EJECUTORA", pia: 80, pim: 90, devengado: 30, cortesUsados: ["2026-08-18"] },
    ]);
    expect(summary.universos).toEqual(expect.arrayContaining([
      expect.objectContaining({ universo: "NACIONAL_DIRIGIDO", pim: 120, devengado: 60, avancePct: 50 }),
      expect.objectContaining({ universo: "REGIONAL_EJECUTADO", pim: 90, devengado: 30, avancePct: 33.33 }),
    ]));
    expect(summary.limitacion).toMatch(/no se suman/i);
  });
});
