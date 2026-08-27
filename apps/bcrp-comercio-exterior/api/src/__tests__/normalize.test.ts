import { describe, expect, it } from "vitest";
import { normalizeBcrpResponse, parsePeriodName } from "../ingest/normalize.js";

describe("parsePeriodName", () => {
  it("parsea periodos mensuales del BCRP", () => {
    expect(parsePeriodName("Ene.2026")).toEqual({ year: 2026, month: 1 });
    expect(parsePeriodName("Jun.2026")).toEqual({ year: 2026, month: 6 });
  });

  it("rechaza formatos inválidos", () => {
    expect(parsePeriodName("2026-01")).toBeNull();
    expect(parsePeriodName("")).toBeNull();
  });
});

describe("normalizeBcrpResponse", () => {
  it("normaliza la respuesta JSON del BCRP a filas mensuales", () => {
    const rows = normalizeBcrpResponse({
      config: {
        title: "Balanza comercial",
        series: [
          { name: "Exportaciones", dec: "0" },
          { name: "Importaciones", dec: "0" },
          { name: "Balanza Comercial", dec: "0" },
        ],
      },
      periods: [
        { name: "Ene.2026", values: ["100", "50", "50"] },
        { name: "Feb.2026", values: ["110", "55", "55"] },
      ],
    });

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      seriesKey: "exportaciones",
      periodYear: 2026,
      periodMonth: 1,
      valueUsdMillions: 100,
    });
    expect(rows[3]).toMatchObject({
      seriesKey: "exportaciones",
      periodYear: 2026,
      periodMonth: 2,
      valueUsdMillions: 110,
    });
  });
});
