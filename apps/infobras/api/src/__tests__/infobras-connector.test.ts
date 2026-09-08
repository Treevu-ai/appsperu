import { describe, expect, it } from "vitest";
import { canonicalizarDepartamentoFuente, normalizeDepartamentoScope } from "../ingest/infobras-connector.js";

describe("canonicalizarDepartamentoFuente", () => {
  it('mapea el alias real de la fuente "P C DEL CALLAO" al nombre canónico CALLAO', () => {
    expect(canonicalizarDepartamentoFuente("P C DEL CALLAO")).toBe("CALLAO");
  });

  it("es insensible a mayúsculas/minúsculas y a espacios extra en el alias", () => {
    expect(canonicalizarDepartamentoFuente("  p c del callao  ")).toBe("CALLAO");
  });

  it("deja pasar sin cambios un departamento que ya viene en su forma canónica", () => {
    expect(canonicalizarDepartamentoFuente("LA LIBERTAD")).toBe("LA LIBERTAD");
  });

  it("normaliza mayúsculas y recorta espacios incluso sin alias registrado", () => {
    expect(canonicalizarDepartamentoFuente("  cusco ")).toBe("CUSCO");
  });

  it("trata un valor vacío o indefinido como cadena vacía, sin lanzar", () => {
    expect(canonicalizarDepartamentoFuente(undefined)).toBe("");
    expect(canonicalizarDepartamentoFuente("")).toBe("");
  });
});

describe("normalizeDepartamentoScope", () => {
  it("acepta CALLAO como departamento válido del catálogo territorial (CT-06)", () => {
    expect(normalizeDepartamentoScope(undefined, ["CALLAO"])).toEqual(["CALLAO"]);
  });

  it("rechaza el alias crudo de la fuente porque el scope solo acepta nombres canónicos", () => {
    expect(() => normalizeDepartamentoScope(undefined, ["P C DEL CALLAO"])).toThrow(
      /fuera del catálogo territorial/
    );
  });
});
