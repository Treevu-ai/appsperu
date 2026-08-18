import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
});

describe("GET /api/crossref", () => {
  it("returns an empty list without querying radar-ejecucion when there are no indicadores CUMP02/CUMP03", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
    expect(ejecucionQueryMock).not.toHaveBeenCalled();
  });

  it("cruza GN y GR calculando SEG y Execution Efficiency con el año más reciente de cada fuente", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "76.60", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "95.00", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP02", nivel_gobierno: "GR", value: "73.70", measurement_date: "2024-01-01" },
      ],
    });
    ejecucionQueryMock
      .mockResolvedValueOnce({ rows: [{ max: 2026 }] })
      .mockResolvedValueOnce({
        rows: [
          { nivel_gobierno: "GOBIERNO NACIONAL", pim: "1000000", devengado: "938000" },
          { nivel_gobierno: "GOBIERNOS REGIONALES", pim: "500000", devengado: "0" },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    const gn = res.body.resultados.find((r: { nivelGobierno: string }) => r.nivelGobierno === "GN");
    expect(gn).toMatchObject({
      nivelGobiernoRadarEjecucion: "GOBIERNO NACIONAL",
      anioCeplan: "2024-01-01",
      anioRadarEjecucion: 2026,
      ejecucionFisicaCeplan: 76.6,
      ejecucionPresupuestalCeplan: 95,
      ejecucionPresupuestalRadarEjecucion: 93.8,
      strategicExecutionGap: 17.2,
      executionEfficiency: 0.82,
    });

    const gr = res.body.resultados.find((r: { nivelGobierno: string }) => r.nivelGobierno === "GR");
    expect(gr.ejecucionPresupuestalRadarEjecucion).toBe(0);
    expect(gr.executionEfficiency).toBeNull();

    const [, ejecucionParams] = ejecucionQueryMock.mock.calls[1];
    expect(ejecucionParams).toEqual([2026, ["GOBIERNO NACIONAL", "GOBIERNOS REGIONALES"]]);
  });

  it("deja los valores de radar-ejecucion en null cuando esa base no tiene ejecución cargada", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ indicator_code: "CUMP02", nivel_gobierno: "GN", value: "76.60", measurement_date: "2024-01-01" }],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [{ max: null }] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    const gn = res.body.resultados.find((r: { nivelGobierno: string }) => r.nivelGobierno === "GN");
    expect(gn.ejecucionPresupuestalRadarEjecucion).toBeNull();
    expect(gn.strategicExecutionGap).toBeNull();
    expect(ejecucionQueryMock).toHaveBeenCalledTimes(1);
  });
});
