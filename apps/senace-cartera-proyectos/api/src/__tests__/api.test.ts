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

/**
 * `/api/proyectos` corre el conteo y la página dentro de una transacción `REPEATABLE READ` sobre
 * un mismo cliente (`pool.connect()`), no dos `pool.query` sueltos -- ver el hallazgo real de
 * CodeRabbit documentado en `senace-connector.ts`/`proyectos.ts`. Cada test resuelve
 * secuencialmente: BEGIN, count, list, COMMIT.
 */
describe("GET /api/proyectos", () => {
  it("sin filtros, consulta sin condición WHERE forzada (senace_id es único, no hay 'batch más reciente')", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "0" }] }) // count
      .mockResolvedValueOnce({ rows: [] }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(createApp()).get("/api/proyectos");

    const [countSql] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/WHERE TRUE/);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("filtra por estado exacto", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/proyectos").query({ estado: "Aprobado" });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/estado = \$1/);
    expect(countParams).toEqual(["Aprobado"]);
  });

  it("rechaza un RUC que no tiene 11 dígitos sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/proyectos").query({ ruc: "123" });
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("filtra por texto con ILIKE parcial sobre titulo y titular", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/proyectos").query({ texto: "Chicama" });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/titulo_proyecto ILIKE \$1 OR titular ILIKE \$1/);
    expect(countParams).toEqual(["%Chicama%"]);
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "5" }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            senace_id: 7,
            titular: "AUTOPISTA DEL NORTE S.A.C",
            ruc: "20520929658",
            titulo_proyecto: "PROYECTO DE REHABILITACIÓN",
            unidad_proyecto: "EVAP",
            tipo: "Clasificación",
            actividad: "Transportes",
            fecha_inicio: "2019-03-29",
            estado: "Aprobado",
            descripcion: "SIN DESCRIPCION",
            longitud: -78.39,
            latitud: -9.37,
            resolucion: "RD N° 00042-2020-SENACE-PE/DEIN",
          },
        ],
      }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(createApp()).get("/api/proyectos").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ senaceId: 7, estado: "Aprobado" });
  });

  it("hace ROLLBACK y libera el cliente si la consulta falla", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("db down")); // count falla

    const res = await request(createApp()).get("/api/proyectos");

    expect(res.status).toBe(500);
    expect(queryMock.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});

describe("GET /api/proyectos/:senaceId", () => {
  it("responde 404 si el proyecto no existe, no un error genérico", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/proyectos/99999999");
    expect(res.status).toBe(404);
  });

  it("responde el detalle real cuando existe", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          senace_id: 7,
          titular: "AUTOPISTA DEL NORTE S.A.C",
          ruc: "20520929658",
          titulo_proyecto: "PROYECTO DE REHABILITACIÓN",
          unidad_proyecto: "EVAP",
          tipo: "Clasificación",
          actividad: "Transportes",
          fecha_inicio: "2019-03-29",
          estado: "Aprobado",
          descripcion: "SIN DESCRIPCION",
          longitud: -78.39,
          latitud: -9.37,
          resolucion: "RD N° 00042-2020-SENACE-PE/DEIN",
        },
      ],
    });

    const res = await request(createApp()).get("/api/proyectos/7");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ senaceId: 7, estado: "Aprobado" });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/senace_id = \$1/);
    expect(params).toEqual([7]);
  });

  it("rechaza senaceId no entero sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/proyectos/no-es-numero");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
