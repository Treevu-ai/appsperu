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

describe("GET /api/intervenciones", () => {
  it("returns the list with traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigo_ruta: "LI-100",
            trayectoria: "EMP. PE-1N (DV. CHEPEN) - CHEPEN - TALAMBO.",
            inicio_km: "05+956",
            final_km: "21+367",
            departamento: "LA LIBERTAD",
            provincia: "CHEPEN",
            estado: "MALO",
            superficie: "TROCHA",
            longitud_km: "15.41",
            responsable: "PROREGION",
            corredor_vial: "CVA 10 CAJAMARCA - LA LIBERTAD I",
            nivel_intervencion: "MEJORAMIENTO",
            tramo: "5",
            fecha_corte: "2026-06-30",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/intervenciones").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({ codigoRuta: "LI-100", longitudKm: 15.41 });
    expect(res.body.resultados[0].tramo).toEqual({ inicioKm: "05+956", finalKm: "21+367" });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/MTC/);
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/intervenciones");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});
