import { describe, expect, it } from "vitest";
import {
  SECTION_NIVEL_MES_BOUNDS,
  departamentoSectionWindow,
  sectionWindowBytes,
} from "../ingest/mef-section-bounds.js";

describe("SECTION_NIVEL_MES_BOUNDS", () => {
  it("defines 9 months for GR and GL (recalibrado CT-10: incluye MES_EJE=8)", () => {
    expect(Object.keys(SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"])).toHaveLength(9);
    expect(Object.keys(SECTION_NIVEL_MES_BOUNDS["GOBIERNOS LOCALES"])).toHaveLength(9);
  });

  it("chains GL mes 0 into Nacional block start", () => {
    const glMes0 = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS LOCALES"]["0"];
    expect(glMes0.end).toBe(5_377_593_670);
  });

  it("returns positive window sizes", () => {
    for (const nivel of Object.values(SECTION_NIVEL_MES_BOUNDS)) {
      for (const bounds of Object.values(nivel)) {
        expect(sectionWindowBytes(bounds)).toBeGreaterThan(1_000_000);
      }
    }
  });
});

describe("departamentoSectionWindow", () => {
  it("clamps the confirmed LA LIBERTAD offset for GR mes 7 to the recalibrated section start (CT-10: offset quedó desactualizado, bounds no)", () => {
    // SECTION_OFFSETS_LA_LIBERTAD no se recalibró (ver comentario en
    // mef-section-bounds.ts) — su valor (120_000_000) ahora cae ANTES del
    // inicio real de la sección mes=7 tras el recalibrado de CT-10
    // (186_759_131), así que departamentoSectionWindow debe recortar al
    // límite de la sección en vez de devolver un byte negativo/fuera de
    // rango. Esto es justamente la propiedad de seguridad documentada: un
    // offset desactualizado nunca produce una ventana inválida, solo una
    // más ancha de lo ideal.
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const window = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LA LIBERTAD");
    expect(window.startByte).toBe(bounds.start);
  });

  it("returns narrow windows for other pilot departments", () => {
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const lambayeque = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LAMBAYEQUE");
    expect(lambayeque.maxBytes).toBeLessThanOrEqual(60 * 1024 * 1024);
    expect(lambayeque.startByte).toBeGreaterThan(bounds.start);
  });
});
