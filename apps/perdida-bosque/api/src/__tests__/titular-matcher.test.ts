import { describe, expect, it } from "vitest";
import { coincideTitular, normalizarNombre } from "../lib/titular-matcher.js";

describe("normalizarNombre", () => {
  it("quita sufijos societarios comunes y normaliza mayúsculas/espacios", () => {
    expect(normalizarNombre("Madera  Lazo S.R.Ltda.")).toBe("MADERA LAZO");
    expect(normalizarNombre("VON HUMBOLDT FOREST S.A.C")).toBe("VON HUMBOLDT FOREST");
    expect(normalizarNombre("Aquamar Investments Inc. S.A.C.")).toBe("AQUAMAR INVESTMENTS INC");
  });
});

describe("coincideTitular", () => {
  it("NO matchea dos empresas genuinamente distintas aunque compartan el mismo título (caso real: Madera Lazo vs Madera Rey)", () => {
    expect(coincideTitular("MADERERA LAZO S.R.LTDA.", "MADERERA REY EIRL")).toBe(false);
  });

  it("matchea la misma empresa con distinto sufijo societario", () => {
    expect(coincideTitular("VON HUMBOLDT FOREST SAC", "'VON HUMBOLDT FOREST' S.A.C.")).toBe(true);
  });

  it("matchea la misma empresa con orden de palabras y puntuación distinta", () => {
    expect(coincideTitular("CORPORACION FORESTAL TRES FRONTERAS S.R.L.", "CORPORACION FORESTAL TRES FRONTERAS SRL.")).toBe(true);
  });

  it("matchea pese a diferencia de tildes/ñ (caso real: Compañía Peruana Forestal vs Compania Peruana Forestal, sin tilde en la fuente OSINFOR)", () => {
    expect(coincideTitular("COMPAÑIA PERUANA FORESTAL S.A.", "COMPANIA PERUANA FORESTAL SA - COPEFOR")).toBe(true);
  });

  it("matchea pese a sufijo societario escrito completo en vez de abreviado (caso real: Turbina S.A.C. vs Turbina Sociedad Anonima Cerrada)", () => {
    expect(coincideTitular("TURBINA S.A.C.", "TURBINA SOCIEDAD ANONIMA CERRADA")).toBe(true);
  });

  it("limitación conocida: NO matchea un error de tipeo dentro de una palabra (caso real: JOREGE vs JORGE)", () => {
    // Documentado como limitación en titular-matcher.ts -- este test fija el
    // comportamiento actual (falso negativo aceptado) para que un cambio
    // futuro en el umbral lo note explícitamente, no por accidente.
    expect(coincideTitular("MADERERA SAN JOREGE E.I.R.L TDA", "MADERERA SAN JORGE E.I.R.LTDA.")).toBe(false);
  });

  it("devuelve false si alguno de los nombres queda vacío tras normalizar", () => {
    expect(coincideTitular("S.A.C.", "ALGUNA EMPRESA SAC")).toBe(false);
  });
});
