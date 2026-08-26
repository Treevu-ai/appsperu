import { describe, expect, it } from "vitest";
import {
  SECTION_NIVEL_MES_BOUNDS,
  departamentoSectionWindow,
  sectionWindowBytes,
} from "../ingest/mef-section-bounds.js";

describe("SECTION_NIVEL_MES_BOUNDS", () => {
  it("defines 8 months for GR and GL", () => {
    expect(Object.keys(SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"])).toHaveLength(8);
    expect(Object.keys(SECTION_NIVEL_MES_BOUNDS["GOBIERNOS LOCALES"])).toHaveLength(8);
  });

  it("chains GL mes 0 into Nacional block start", () => {
    const glMes0 = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS LOCALES"]["0"];
    expect(glMes0.end).toBe(4_767_552_175);
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
  it("uses confirmed LA LIBERTAD offset for GR mes 7", () => {
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const window = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LA LIBERTAD");
    expect(window.maxBytes).toBe(60 * 1024 * 1024);
    expect(window.startByte).toBe(120_000_000 - 20 * 1024 * 1024);
  });

  it("returns narrow windows for other pilot departments", () => {
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const lambayeque = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LAMBAYEQUE");
    expect(lambayeque.maxBytes).toBeLessThanOrEqual(60 * 1024 * 1024);
    expect(lambayeque.startByte).toBeGreaterThan(bounds.start);
  });
});
