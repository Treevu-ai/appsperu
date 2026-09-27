import { describe, expect, it } from "vitest";
import { normalizeBcrpResponse, normalizeMacroBcrpResponse, parsePeriodName } from "../ingest/normalize.js";

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
  it("normaliza la respuesta JSON del BCRP a filas mensuales (comercio exterior)", () => {
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
      value: 100,
      unit: "millones_USD",
      category: "exportacion_fob",
    });
    expect(rows[3]).toMatchObject({
      seriesKey: "exportaciones",
      periodYear: 2026,
      periodMonth: 2,
      value: 110,
      unit: "millones_USD",
    });
  });
});

describe("normalizeMacroBcrpResponse", () => {
  it("normaliza la respuesta JSON del BCRP a filas mensuales (series macro)", () => {
    const rows = normalizeMacroBcrpResponse({
      config: {
        title: "Indicadores macro",
        series: [
          { name: "Tipo de cambio - promedio del periodo (S/ por US$)", dec: "3" },
          { name: "Índice de precios Lima Metropolitana (var% mensual)", dec: "2" },
        ],
      },
      periods: [
        { name: "Ene.2026", values: ["3.75", "0.15"] },
        { name: "Feb.2026", values: ["3.73", "0.12"] },
      ],
    });

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      seriesKey: "tipo_cambio_promedio",
      periodYear: 2026,
      periodMonth: 1,
      value: 3.75,
      unit: "Soles_por_USD",
      category: "tipo_cambio",
    });
    expect(rows[1]).toMatchObject({
      seriesKey: "ipc_lima_var_mensual",
      periodYear: 2026,
      periodMonth: 1,
      value: 0.15,
      unit: "var_pct",
      category: "inflacion",
    });
    expect(rows[2]).toMatchObject({
      seriesKey: "tipo_cambio_promedio",
      periodYear: 2026,
      periodMonth: 2,
      value: 3.73,
    });
    expect(rows[3]).toMatchObject({
      seriesKey: "ipc_lima_var_mensual",
      periodYear: 2026,
      periodMonth: 2,
      value: 0.12,
    });
  });
});