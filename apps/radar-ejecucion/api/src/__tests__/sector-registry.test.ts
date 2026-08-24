import { describe, expect, it } from "vitest";
import { INITIAL_SECTOR_SEEDS, scopeLabel } from "../sector/registry.js";

describe("registro sectorial", () => {
  it("has unique sector/entity pairs and uses the territorial rule dictated by government level", () => {
    const keys = INITIAL_SECTOR_SEEDS.map((seed) => `${seed.sectorId}:${seed.entityCode}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const seed of INITIAL_SECTOR_SEEDS) {
      expect(seed.nivelGobierno === "GOBIERNO NACIONAL" ? seed.scopeRule : seed.scopeRule).toBe(
        seed.nivelGobierno === "GOBIERNO NACIONAL" ? "META_DEPARTAMENTO" : "SEDE_EJECUTORA",
      );
    }
  });

  it("uses human labels that distinguish national destination from regional seat", () => {
    expect(scopeLabel("META_DEPARTAMENTO")).toMatch(/dirigido/i);
    expect(scopeLabel("SEDE_EJECUTORA")).toMatch(/sede/i);
  });
});
