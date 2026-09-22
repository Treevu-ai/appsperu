import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock, connect: connectMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
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

describe("GET /api/emergencias", () => {
  it("sin filtros, consulta sin condición WHERE forzada (snapshot completo)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "0" }] }) // count
      .mockResolvedValueOnce({ rows: [] }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(createApp()).get("/api/emergencias");

    const [countSql] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/WHERE TRUE/);
  });

  it("filtra por departamento y año", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/emergencias").query({ departamento: "LA LIBERTAD", anio: 2018 });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/departamento = \$1/);
    expect(countSql).toMatch(/anio = \$2/);
    expect(countParams).toEqual(["LA LIBERTAD", 2018]);
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            sinpad_id: 351,
            fecha_emergencia: "2003-02-11",
            anio: 2003,
            mes: "FEBRERO",
            cod_distrito: "010101",
            departamento: "AMAZONAS",
            provincia: "CHACHAPOYAS",
            distrito: "CHACHAPOYAS",
            peligro: "LLUVIA INTENSA",
            tipo_peligro: "ORIGEN NATURAL",
            region_natural: "SIERRA",
            fallecidos: 0,
            desaparecidos: 0,
            lesionados: 0,
            damnificados: 4,
            afectados: 0,
            viviendas_destruidas: 0,
            viviendas_afectadas: 1,
            peso_ayuda: 363.24,
            costo_ayuda: 345.4446,
            detalle_edan: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/emergencias").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ sinpadId: 351, departamento: "AMAZONAS", damnificados: 4 });
  });

  it("hace ROLLBACK y libera el cliente si la consulta falla", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("db down"));

    const res = await request(createApp()).get("/api/emergencias");

    expect(res.status).toBe(500);
    expect(queryMock.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});

describe("GET /api/emergencias/:id", () => {
  it("responde 404 si la emergencia no existe, no un error genérico", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/emergencias/999999999");
    expect(res.status).toBe(404);
  });

  it("responde el detalle real cuando existe", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          sinpad_id: 351,
          fecha_emergencia: "2003-02-11",
          anio: 2003,
          mes: "FEBRERO",
          cod_distrito: "010101",
          departamento: "AMAZONAS",
          provincia: "CHACHAPOYAS",
          distrito: "CHACHAPOYAS",
          peligro: "LLUVIA INTENSA",
          tipo_peligro: "ORIGEN NATURAL",
          region_natural: "SIERRA",
          fallecidos: 0,
          desaparecidos: 0,
          lesionados: 0,
          damnificados: 4,
          afectados: 0,
          viviendas_destruidas: 0,
          viviendas_afectadas: 1,
          peso_ayuda: 363.24,
          costo_ayuda: 345.4446,
          detalle_edan: null,
        },
      ],
    });

    const res = await request(createApp()).get("/api/emergencias/1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, sinpadId: 351 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/id = \$1/);
    expect(params).toEqual([1]);
  });

  it("rechaza id no entero sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/emergencias/no-es-numero");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
