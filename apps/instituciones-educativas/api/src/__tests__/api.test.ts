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

describe("GET /api/instituciones", () => {
  it("returns the list with coordinates, traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            cod_mod: "0415547",
            anexo: "0",
            nombre: "123",
            nivel_modalidad: "Inicial - Jardín",
            gestion: "Pública de gestión directa",
            direccion: "JIRON TERESA GONZALES DE FANNY 543",
            ubigeo: "020105",
            departamento: "ANCASH",
            provincia: "HUARAZ",
            distrito: "INDEPENDENCIA",
            ugel: "UGEL HUARAZ",
            latitud: -9.51885,
            longitud: -77.53191,
            turno: "Mañana",
            ruc: null,
            razon_social: null,
            estado: "Activo",
            fecha_actualizacion: "2026-08-28",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/instituciones").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({
      codModular: "0415547",
      coordenadas: { lat: -9.51885, lon: -77.53191 },
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/MINEDU/);
  });

  it("returns null coordenadas when latitud/longitud are missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            cod_mod: "0415547",
            anexo: "0",
            nombre: "123",
            nivel_modalidad: null,
            gestion: null,
            direccion: null,
            ubigeo: null,
            departamento: "ANCASH",
            provincia: "HUARAZ",
            distrito: "INDEPENDENCIA",
            ugel: null,
            latitud: null,
            longitud: null,
            turno: null,
            ruc: null,
            razon_social: null,
            estado: null,
            fecha_actualizacion: null,
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });
    const app = createApp();
    const res = await request(app).get("/api/instituciones");
    expect(res.body.resultados[0].coordenadas).toBeNull();
  });

  it("rejects an ubigeo that is not 6 digits instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/instituciones").query({ ubigeo: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/resumen", () => {
  it("defaults to LA LIBERTAD and aggregates by provincia/distrito", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { provincia: "TRUJILLO", distrito: "TRUJILLO", total: 120, activas: 90 },
        { provincia: "TRUJILLO", distrito: "LA ESPERANZA", total: 45, activas: 40 },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/resumen");

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");
    expect(res.body.distritos).toHaveLength(2);
    expect(res.body.distritos[0]).toMatchObject({ provincia: "TRUJILLO", totalInstituciones: 120, institucionesActivas: 90 });
    expect(queryMock.mock.calls[0][1]).toEqual(["LA LIBERTAD"]);
  });

  it("accepts a custom departamento", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/resumen").query({ departamento: "ANCASH" });
    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("ANCASH");
  });
});
