import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();
const infobrasQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));
vi.mock("../db/infobras-pool.js", () => ({
  infobrasPool: { query: infobrasQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
  infobrasQueryMock.mockReset();
});

describe("GET /api/indicators/seg", () => {
  it("returns national SEG for GN and GR", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "73.70", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "95.10", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP02", nivel_gobierno: "GR", value: "68.00", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GR", value: "90.00", measurement_date: "2024-01-01" },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [{ max: 2026 }] });

    const res = await request(createApp()).get("/api/indicators/seg");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cobertura: "NACIONAL",
      fuente: "ceplan+radar-ejecucion",
      corte: { anioCeplan: 2024, anioEjecucion: 2026 },
    });
    const gn = res.body.resultados.find((row: { nivelGobierno: string }) => row.nivelGobierno === "GN");
    expect(gn).toMatchObject({ segPp: 21.4, variante: "NACIONAL_CEPLAN" });
    const gr = res.body.resultados.find((row: { nivelGobierno: string }) => row.nivelGobierno === "GR");
    expect(gr.segPp).toBe(22);
  });

  it("returns departmental PROXY seg when departamento is provided", async () => {
    ejecucionQueryMock
      .mockResolvedValueOnce({ rows: [{ max: 2026 }] })
      .mockResolvedValueOnce({ rows: [{ pim: "1000000", devengado: "725000" }] });
    infobrasQueryMock.mockResolvedValueOnce({ rows: [{ avance: "45.20", obras: "12" }] });

    const res = await request(createApp())
      .get("/api/indicators/seg")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      variante: "PROXY_DEPARTAMENTAL",
      departamento: "LA LIBERTAD",
      ejecucionPresupuestalPct: 72.5,
      avanceFisicoMedioPct: 45.2,
      segPp: 27.3,
      cobertura: "PARCIAL",
    });
  });

  it("returns null segPp when PIM is zero", async () => {
    ejecucionQueryMock
      .mockResolvedValueOnce({ rows: [{ max: 2026 }] })
      .mockResolvedValueOnce({ rows: [{ pim: "0", devengado: "0" }] });
    infobrasQueryMock.mockResolvedValueOnce({ rows: [{ avance: "45.20", obras: "12" }] });

    const res = await request(createApp())
      .get("/api/indicators/seg")
      .query({ departamento: "PIURA" });

    expect(res.status).toBe(200);
    expect(res.body.segPp).toBeNull();
    expect(res.body.restriccion).toMatch(/PIM=0/);
  });
});

describe("GET /api/indicators/execution-efficiency", () => {
  it("returns national execution efficiency", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "73.70", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "95.10", measurement_date: "2024-01-01" },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [{ max: 2026 }] });

    const res = await request(createApp()).get("/api/indicators/execution-efficiency");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].executionEfficiency).toBeCloseTo(0.775, 3);
  });

  it("returns departmental proxy execution efficiency", async () => {
    ejecucionQueryMock
      .mockResolvedValueOnce({ rows: [{ max: 2026 }] })
      .mockResolvedValueOnce({ rows: [{ pim: "1000000", devengado: "500000" }] });
    infobrasQueryMock.mockResolvedValueOnce({ rows: [{ avance: "40.00", obras: "8" }] });

    const res = await request(createApp())
      .get("/api/indicators/execution-efficiency")
      .query({ departamento: "CUSCO" });

    expect(res.status).toBe(200);
    expect(res.body.executionEfficiency).toBe(0.8);
  });
});

describe("GET /api/indicators/plan-budget-alignment", () => {
  it("returns dimension shares for a pilot department", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [
        { funcion: "SALUD", devengado: "300000" },
        { funcion: "EDUCACION", devengado: "700000" },
      ],
    });

    const res = await request(createApp())
      .get("/api/indicators/plan-budget-alignment")
      .query({ departamento: "LAMBAYEQUE", anio: 2026 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      departamento: "LAMBAYEQUE",
      mapeoVersion: "v1",
      gastoDevengadoTotal: 1000000,
    });
    const salud = res.body.dimensiones.find((row: { dimension: string }) => row.dimension === "Salud y nutrición");
    expect(salud.participacionPresupuestoDept).toBe(0.3);
  });

  it("rejects non-pilot departments", async () => {
    const res = await request(createApp())
      .get("/api/indicators/plan-budget-alignment")
      .query({ departamento: "LIMA" });

    expect(res.status).toBe(400);
    expect(ejecucionQueryMock).not.toHaveBeenCalled();
  });
});
