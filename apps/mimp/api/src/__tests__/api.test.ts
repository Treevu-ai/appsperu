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

describe("GET /api/cem", () => {
  it("returns the list filtered by departamento, with numbers coerced", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          anio_reporte: 2025,
          periodo: "ENE - DIC",
          codigo_centro_atencion: "CEM001",
          nombre_centro_atencion: "TRUJILLO",
          ubigeo: "130101",
          departamento: "LA LIBERTAD",
          provincia: "TRUJILLO",
          distrito: "TRUJILLO",
          casos_total: "340",
          casos_hombres: "87",
          casos_mujeres: "253",
          casos_violencia_psicologica: "180",
          casos_violencia_fisica: "100",
          casos_violencia_sexual: "40",
          casos_violencia_economica: "20",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/cem").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ departamento: "LA LIBERTAD", casosTotal: 340, casosMujeres: 253 });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/CEM/);
  });

  it("rejects an invalid año instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/cem").query({ anio: 1500 });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/chat100", () => {
  it("returns the national annual series", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          anio_reporte: 2021,
          periodo: "ENE - DIC",
          consultas_total: "5910",
          consultas_hombres: "1385",
          consultas_mujeres: "4519",
          consultas_no_especifica_sexo: "6",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/chat100");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ anioReporte: 2021, consultasTotal: 5910 });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Chat 100/);
  });
});
