import { describe, expect, it } from "vitest";
import { buildUbigeo, CONFIRMED_MEF_FIELD_MAPPING } from "../ingest/field-mapping.js";

describe("CONFIRMED_MEF_FIELD_MAPPING", () => {
  it("keys entities by SEC_EJEC, not PLIEGO", () => {
    // SEC_EJEC identifica a la entidad ejecutora; PLIEGO es la unidad presupuestal
    // superior y agruparía múltiples entidades bajo una sola clave.
    expect(CONFIRMED_MEF_FIELD_MAPPING.entityCode).toBe("SEC_EJEC");
  });
});

describe("buildUbigeo", () => {
  it("joins three 2-digit codes into a 6-digit ubigeo", () => {
    expect(buildUbigeo("15", "01", "01")).toBe("150101");
  });

  it("pads single-digit codes with a leading zero", () => {
    expect(buildUbigeo(15, 1, 1)).toBe("150101");
  });

  it("returns null when any part is missing", () => {
    expect(buildUbigeo("15", "", "01")).toBeNull();
    expect(buildUbigeo(undefined, "01", "01")).toBeNull();
  });

  it("returns null when a part is not a plausible 2-digit code", () => {
    expect(buildUbigeo("150", "01", "01")).toBeNull();
    expect(buildUbigeo("AB", "01", "01")).toBeNull();
  });
});
