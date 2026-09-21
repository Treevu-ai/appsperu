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
    const res = await request(createApp()).get("/health");
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

describe("GET /api/areas", () => {
  it("sin filtros, consulta sin condición WHERE forzada", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/areas");
    const [countSql] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/WHERE TRUE/);
  });

  it("filtra por capa exacta", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/areas").query({ capa: "anp_nacional_definitiva" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/capa = \$1/);
    expect(countParams).toEqual(["anp_nacional_definitiva"]);
  });

  it("rechaza una capa fuera del enum sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/areas").query({ capa: "capa-inexistente" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("filtra por ubicacion con ILIKE parcial", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/areas").query({ ubicacion: "La Libertad" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/ubicacion ILIKE \$1/);
    expect(countParams).toEqual(["%La Libertad%"]);
  });

  it("devuelve resultados con limit/offset/hasMore", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            capa: "anp_nacional_definitiva",
            objectid: 17938,
            codigo: "PN05",
            nombre: "Cerros de Amotape",
            categoria: "Parque Nacional",
            ubicacion: "Tumbes y Piura",
            superficie_ha: 152045.13,
            base_legal_establecimiento: "D.S. N° 0800-1975-AG",
            fecha_establecimiento: "1975-07-22",
            base_legal_modificacion: null,
            fecha_modificacion: null,
            observaciones: null,
            atributos_extra: null,
          },
        ],
      });

    const res = await request(createApp()).get("/api/areas").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ codigo: "PN05", categoria: "Parque Nacional" });
  });
});

describe("GET /api/areas/:capa/:objectid", () => {
  it("responde 404 si el área no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/areas/anp_nacional_definitiva/999999");
    expect(res.status).toBe(404);
  });

  it("rechaza una capa fuera del enum sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/areas/capa-inexistente/1");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde el detalle real cuando existe", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          capa: "anp_nacional_definitiva",
          objectid: 17938,
          codigo: "PN05",
          nombre: "Cerros de Amotape",
          categoria: "Parque Nacional",
          ubicacion: "Tumbes y Piura",
          superficie_ha: 152045.13,
          base_legal_establecimiento: "D.S. N° 0800-1975-AG",
          fecha_establecimiento: "1975-07-22",
          base_legal_modificacion: null,
          fecha_modificacion: null,
          observaciones: null,
          atributos_extra: null,
        },
      ],
    });

    const res = await request(createApp()).get("/api/areas/anp_nacional_definitiva/17938");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ codigo: "PN05", objectid: 17938 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/capa = \$1 AND objectid = \$2/);
    expect(params).toEqual(["anp_nacional_definitiva", 17938]);
  });
});
