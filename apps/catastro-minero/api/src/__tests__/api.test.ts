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

describe("GET /api/derechos", () => {
  it("sin filtros, consulta sin condición WHERE forzada", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/derechos");
    const [countSql] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/WHERE TRUE/);
  });

  it("filtra por departamento exacto", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/derechos").query({ departamento: "LA LIBERTAD" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/departamento = \$1/);
    expect(countParams).toEqual(["LA LIBERTAD"]);
  });

  it("filtra por titular con ILIKE parcial", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/derechos").query({ titular: "Yanacocha" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/titular ILIKE \$1/);
    expect(countParams).toEqual(["%Yanacocha%"]);
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigou: "010033716",
            fecha_denuncio: "2016-01-04",
            concesion: "HUACRACANCHA 04",
            titular: "MINERA YANACOCHA S.R.L.",
            hectareas: 899.9835,
            estado: "T",
            estado_descripcion: "D.M. Titulado D.L. 708",
            sustancia: "M",
            departamento: "LA LIBERTAD",
            provincia: "JULCAN / SANTIAGO DE CHUCO",
            distrito: "QUIRUVILCA / CALAMARCA",
            fecha_actualizacion: "2026-09-20T05:29:45.000Z",
          },
        ],
      });

    const res = await request(createApp()).get("/api/derechos").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ codigou: "010033716", departamento: "LA LIBERTAD" });
  });
});

describe("GET /api/derechos/:codigou", () => {
  it("responde 404 si el derecho no existe, no un error genérico", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/derechos/000000000");
    expect(res.status).toBe(404);
  });

  it("responde el detalle real cuando existe", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          codigou: "010033716",
          fecha_denuncio: "2016-01-04",
          concesion: "HUACRACANCHA 04",
          titular: "MINERA YANACOCHA S.R.L.",
          hectareas: 899.9835,
          estado: "T",
          estado_descripcion: "D.M. Titulado D.L. 708",
          sustancia: "M",
          departamento: "LA LIBERTAD",
          provincia: "JULCAN / SANTIAGO DE CHUCO",
          distrito: "QUIRUVILCA / CALAMARCA",
          fecha_actualizacion: "2026-09-20T05:29:45.000Z",
        },
      ],
    });

    const res = await request(createApp()).get("/api/derechos/010033716");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ codigou: "010033716", titular: "MINERA YANACOCHA S.R.L." });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/WHERE codigou = \$1/);
    expect(params).toEqual(["010033716"]);
  });
});
