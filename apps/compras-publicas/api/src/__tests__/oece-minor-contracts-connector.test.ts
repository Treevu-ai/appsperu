import { describe, expect, it, vi } from "vitest";

// Estas pruebas cubren helpers puros; no requieren una DATABASE_URL local.
vi.mock("../db/pool.js", () => ({ pool: {} }));

import {
  categoryFromSeace,
  classifyContractingEntity,
  normalizeSeaceDepartmentScope,
  parseSeaceDate,
  seaceDepartmentCode,
} from "../ingest/oece-minor-contracts-connector.js";

describe("OECE SEACE public minor-contract connector helpers", () => {
  it("classifies every contracting entity without excluding provincial municipalities", () => {
    expect(classifyContractingEntity("MUNICIPALIDAD DISTRITAL DE SARIN")).toBe("MUNICIPALITY_DISTRICT");
    expect(classifyContractingEntity("MUNICIPALIDAD PROVINCIAL DE TRUJILLO")).toBe("MUNICIPALITY_PROVINCE");
    expect(classifyContractingEntity("REGION LA LIBERTAD - EDUCACION")).toBe("REGIONAL_GOVERNMENT");
    expect(classifyContractingEntity("UNIDAD EJECUTORA SALUD")).toBe("OTHER_PUBLIC_ENTITY");
  });

  it("maps only the goods and services categories required by the PRD", () => {
    expect(categoryFromSeace("Bien")).toBe("goods");
    expect(categoryFromSeace("Servicio")).toBe("services");
    expect(categoryFromSeace("Obra")).toBeNull();
  });

  it("converts the public date format to an explicit Peru offset", () => {
    expect(parseSeaceDate("20/08/2026 17:46:26")).toBe("2026-08-20T17:46:26-05:00");
    expect(parseSeaceDate("not-a-date")).toBeNull();
  });

  it("maps all 25 territorial jurisdictions to official SEACE codes", () => {
    expect(normalizeSeaceDepartmentScope()).toHaveLength(25);
    expect(normalizeSeaceDepartmentScope()).toContain("CALLAO");
    expect(seaceDepartmentCode("AMAZONAS")).toBe("01");
    expect(seaceDepartmentCode("LAMBAYEQUE")).toBe("14");
    expect(seaceDepartmentCode("PIURA")).toBe("20");
    expect(seaceDepartmentCode("CAJAMARCA")).toBe("06");
    expect(seaceDepartmentCode("CUSCO")).toBe("08");
  });
});
