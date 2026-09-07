import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /health", () => {
  it("responds ok without touching the database", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("confirms the database dependency before declaring the service ready", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
  });

  it("does not expose an internal error when the database is unavailable", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/residuos", () => {
  it("returns the list with traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ubigeo: "130101",
            anio: 2024,
            departamento: "LA LIBERTAD",
            provincia: "TRUJILLO",
            distrito: "TRUJILLO",
            tipo_municipalidad: "PROVINCIAL",
            poblacion_total: 300000,
            generacion_percapita_dom: "0.65",
            generacion_dom_urbana_tanio: "50000.12",
            generacion_mun_tanio: "70000.5",
            generacion_mun_tdia: "191.78",
            fecha_corte: "2025-12-18",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/residuos").query({ departamento: "LA LIBERTAD", anio: 2024 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({ ubigeo: "130101", generacionPerCapitaDomKgDia: 0.65 });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/MINAM/);
  });

  it("rejects an ubigeo that is not 6 digits instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/residuos").query({ ubigeo: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/residuos");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});
