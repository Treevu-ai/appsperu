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
  it("descarta el offset confirmado de LA LIBERTAD para GR mes 7 y usa la estimación alfabética (hallazgo CodeRabbit PR #145: offset stale que igual cae dentro de bounds podía devolver un subconjunto parcial sin disparar el fallback)", () => {
    // SECTION_OFFSETS_LA_LIBERTAD no se recalibró (ver comentario en
    // mef-section-bounds.ts) — su valor (120_000_000) ahora cae ANTES del
    // inicio real de la sección mes=7 tras el recalibrado de CT-10
    // (186_759_131). Antes del fix, esto se clampeaba silenciosamente al
    // inicio de la sección — una ventana que casi seguro NO contiene las
    // filas de LA LIBERTAD (que alfabéticamente están cerca del medio),
    // apoyándose únicamente en "0 filas -> fallback" para no fallar en
    // silencio. Con el fix, un `confirmed` fuera de `bounds` (o demasiado
    // lejos de la estimación alfabética) se descarta directamente y se usa
    // la estimación recalibrada — la ventana apunta al lugar correcto en
    // vez de depender de que el fallback se dispare.
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const window = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LA LIBERTAD");
    expect(window.startByte).toBeGreaterThan(bounds.start);
    // Debe coincidir con la ventana que produciría cualquier otro
    // departamento en la misma posición alfabética (índice 12/25), no con el
    // offset manual descartado.
    const referencia = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LAMBAYEQUE"); // índice 13/25, vecino inmediato
    expect(Math.abs(window.startByte - referencia.startByte)).toBeLessThan(60 * 1024 * 1024);
  });

  it("usa el offset confirmado cuando cae dentro de bounds y cerca de la estimación alfabética", () => {
    // Construye bounds sintéticos donde el offset manual (120_000_000, GR mes 7)
    // sigue siendo plausible: dentro de rango y cerca de donde interpolaría la
    // posición alfabética de LA LIBERTAD (índice 12/25 = ratio 0.5).
    const bounds = { start: 0, end: 240_000_000 };
    const window = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LA LIBERTAD");
    // confirmed=120_000_000 coincide exactamente con el centro (ratio 0.5 de
    // un rango de 240M) — debe usarse tal cual, no la estimación descartada.
    expect(window.startByte).toBe(Math.max(bounds.start, 120_000_000 - 20 * 1024 * 1024));
  });

  it("returns narrow windows for other pilot departments", () => {
    const bounds = SECTION_NIVEL_MES_BOUNDS["GOBIERNOS REGIONALES"]["7"];
    const lambayeque = departamentoSectionWindow("GOBIERNOS REGIONALES", "7", bounds, "LAMBAYEQUE");
    expect(lambayeque.maxBytes).toBeLessThanOrEqual(60 * 1024 * 1024);
    expect(lambayeque.startByte).toBeGreaterThan(bounds.start);
  });
});
