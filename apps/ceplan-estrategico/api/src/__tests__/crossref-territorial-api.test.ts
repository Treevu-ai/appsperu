import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();
const fetchTerritorySummaryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));
vi.mock("../lib/ceplan-geo-client.js", () => ({
  fetchTerritorySummary: fetchTerritorySummaryMock,
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
  fetchTerritorySummaryMock.mockReset();
});

describe("GET /api/crossref/territorial", () => {
  it("rejects departments outside the 5-region pilot", async () => {
    const app = createApp();
    const res = await request(app).get("/api/crossref/territorial").query({ departamento: "LIMA" });

    expect(res.status).toBe(400);
    expect(res.body.departamentosPermitidos).toEqual([
      "LA LIBERTAD",
      "LAMBAYEQUE",
      "PIURA",
      "CAJAMARCA",
      "CUSCO",
    ]);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("returns 502 with cobertura BLOQUEADA when ceplan-geo is unavailable", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "73.70", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "95.10", measurement_date: "2024-01-01" },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [{ max: 2026 }] });
    fetchTerritorySummaryMock.mockResolvedValueOnce({
      ok: false,
      url: "http://localhost:4005/api/territories/summary?departamento=LA%20LIBERTAD",
      error: "Timeout al consultar API",
    });

    const app = createApp();
    const res = await request(app)
      .get("/api/crossref/territorial")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      matcher: "departamento_prefijo_ubigeo",
      cobertura: "BLOQUEADA",
      departamento: "LA LIBERTAD",
      ubigeoPrefijo: "13",
      contextoTerritorial: null,
    });
    expect(res.body.dependencias[0]).toMatchObject({ app: "ceplan-geo", ok: false });
    expect(res.body.marcoEstrategicoNacional.GN).toMatchObject({
      CUMP02: 73.7,
      CUMP03: 95.1,
      segPp: 21.4,
    });
  });

  it("combines national CEPLAN indicators with territorial summary for pilot departments", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { indicator_code: "CUMP02", nivel_gobierno: "GN", value: "73.70", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP03", nivel_gobierno: "GN", value: "95.10", measurement_date: "2024-01-01" },
        { indicator_code: "CUMP02", nivel_gobierno: "GR", value: "68.00", measurement_date: "2024-01-01" },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [{ max: 2026 }] });
    fetchTerritorySummaryMock.mockResolvedValueOnce({
      ok: true,
      url: "http://localhost:4005/api/territories/summary?departamento=LAMBAYEQUE",
      summary: {
        departamento: "LAMBAYEQUE",
        ubigeoPrefijo: "14",
        distritos: 38,
        infraestructura: { aeropuerto: 2, puerto: 1 },
        fuente: "ceplan-geo",
      },
    });

    const app = createApp();
    const res = await request(app)
      .get("/api/crossref/territorial")
      .query({ departamento: "lambayeque" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      matcher: "departamento_prefijo_ubigeo",
      cobertura: "PARCIAL",
      departamento: "LAMBAYEQUE",
      ubigeoPrefijo: "14",
      corte: { anioCeplan: 2024, anioEjecucion: 2026 },
      contextoTerritorial: {
        distritos: 38,
        infraestructura: { aeropuerto: 2, puerto: 1 },
        fuente: "ceplan-geo",
      },
    });
    expect(res.body.marcoEstrategicoNacional.GN.executionEfficiency).toBeCloseTo(0.775, 3);
    expect(res.body.marcoEstrategicoNacional.GR.CUMP03).toBeNull();
    expect(fetchTerritorySummaryMock).toHaveBeenCalledWith("LAMBAYEQUE");
  });
});
