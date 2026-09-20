import { describe, expect, it } from "vitest";
import { parseGetNombreConsulta } from "../ingest/padron-ppa-normalize.js";

describe("parseGetNombreConsulta", () => {
  it("marca registrado=true cuando el resultado trae un nombre real (ACOPAGRO, verificado en vivo)", () => {
    const result = parseGetNombreConsulta({
      result: "COOPERATIVA AGRARIA ACOPAGRO LTDA",
      success: true,
      error: null,
    });
    expect(result.registrado).toBe(true);
    expect(result.nombrePpa).toBe("COOPERATIVA AGRARIA ACOPAGRO LTDA");
  });

  it("marca registrado=false cuando el resultado es el sentinel '-' (RUC inventado, verificado en vivo)", () => {
    const result = parseGetNombreConsulta({
      result: "-",
      success: true,
      error: null,
    });
    expect(result.registrado).toBe(false);
    expect(result.nombrePpa).toBeNull();
  });

  it("marca registrado=false cuando el resultado es null o vacío", () => {
    expect(parseGetNombreConsulta({ result: null, success: true, error: null }).registrado).toBe(false);
    expect(parseGetNombreConsulta({ result: "", success: true, error: null }).registrado).toBe(false);
  });
});
