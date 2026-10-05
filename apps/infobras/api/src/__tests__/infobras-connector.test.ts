import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../db/ejecucion-pool.js", () => ({ ejecucionPool: { query: vi.fn() } }));

const { canonicalizarDepartamentoFuente, normalizeDepartamentoScope, corregirGeografiaFuente } = await import(
  "../ingest/infobras-connector.js"
);

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

describe("corregirGeografiaFuente", () => {
  it("reclasifica las 4 provincias de Ica etiquetadas como Huancavelica (DQ-19)", () => {
    expect(corregirGeografiaFuente("HUANCAVELICA", "CHINCHA")).toEqual({ departamento: "ICA", provincia: "CHINCHA" });
    expect(corregirGeografiaFuente("HUANCAVELICA", "PISCO")).toEqual({ departamento: "ICA", provincia: "PISCO" });
    expect(corregirGeografiaFuente("HUANCAVELICA", "PALPA")).toEqual({ departamento: "ICA", provincia: "PALPA" });
  });

  it('normaliza "NAZCA" a la grafía oficial "NASCA" al reclasificar a Ica', () => {
    expect(corregirGeografiaFuente("HUANCAVELICA", "NAZCA")).toEqual({ departamento: "ICA", provincia: "NASCA" });
    expect(corregirGeografiaFuente("HUANCAVELICA", "NASCA")).toEqual({ departamento: "ICA", provincia: "NASCA" });
  });

  it("corrige la provincia corrupta ANDAHUAYLAS a HUAYLAS dentro de Áncash, sin tocar el departamento", () => {
    expect(corregirGeografiaFuente("ANCASH", "ANDAHUAYLAS")).toEqual({ departamento: "ANCASH", provincia: "HUAYLAS" });
  });

  it("no toca ANDAHUAYLAS cuando el departamento declarado ya es APURIMAC (ahí sí es la provincia real)", () => {
    expect(corregirGeografiaFuente("APURIMAC", "ANDAHUAYLAS")).toBeNull();
  });

  it("devuelve null para departamento/provincia sin corrección conocida", () => {
    expect(corregirGeografiaFuente("LA LIBERTAD", "TRUJILLO")).toBeNull();
    expect(corregirGeografiaFuente("HUANCAVELICA", "TAYACAJA")).toBeNull();
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
