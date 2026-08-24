import { describe, expect, it } from "vitest";
import { categoryFromSeace, isDistrictMunicipality, parseSeaceDate } from "../ingest/oece-minor-contracts-connector.js";

describe("OECE SEACE public minor-contract connector helpers", () => {
  it("accepts only district municipalities in the pilot scope", () => {
    expect(isDistrictMunicipality("MUNICIPALIDAD DISTRITAL DE SARIN")).toBe(true);
    expect(isDistrictMunicipality("MUNICIPALIDAD PROVINCIAL DE TRUJILLO")).toBe(false);
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
});
