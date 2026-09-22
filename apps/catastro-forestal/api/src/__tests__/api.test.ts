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
 * `/api/titulos` corre el conteo y la página dentro de una transacción `REPEATABLE READ` sobre
 * un mismo cliente (`pool.connect()`), no dos `pool.query` sueltos -- ver el hallazgo real
 * documentado en `serfor-connector.ts`/`titulos.ts`. Cada test resuelve secuencialmente: BEGIN,
 * count, list, COMMIT.
 */
describe("GET /api/titulos", () => {
  it("sin filtros, consulta sin condición WHERE forzada (cada capa es un snapshot completo)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "0" }] }) // count
      .mockResolvedValueOnce({ rows: [] }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(createApp()).get("/api/titulos");

    const [countSql] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/WHERE TRUE/);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("filtra por capa exacta", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/titulos").query({ capa: "modalidad_concesiones_forestales" });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/capa = \$1/);
    expect(countParams).toEqual(["modalidad_concesiones_forestales"]);
  });

  it("rechaza una capa que no existe en el enum, sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/titulos").query({ capa: "capa-inventada" });
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("filtra por nomDep (código UBIGEO, no nombre)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/titulos").query({ nomDep: "22" });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/nom_dep = \$1/);
    expect(countParams).toEqual(["22"]);
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ total: "5" }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            capa: "modalidad_concesiones_forestales",
            objectid: 16850,
            fuente: "DGFFS-DICFFS",
            doc_reg: null,
            fec_reg: null,
            observ: "RD N° 216-2013-OSINFOR-DSCFFS",
            zon_utm: 18,
            origen: 5,
            nom_dis: "220602",
            nom_pro: "2206",
            nom_dep: "22",
            aut_for: 6,
            fec_ini: "2003-02-21",
            fec_ter: "2033-01-01",
            situac: 1,
            sup_sig: 29690.238,
            sup_apr: 29690,
            doc_leg: null,
            fec_leg: null,
            atributos_extra: { TIPCON: 80204 },
          },
        ],
      }) // list
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(createApp()).get("/api/titulos").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ capa: "modalidad_concesiones_forestales", objectid: 16850, nomDep: "22" });
  });

  it("hace ROLLBACK y libera el cliente si la consulta falla", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("db down")); // count falla

    const res = await request(createApp()).get("/api/titulos");

    expect(res.status).toBe(500);
    expect(queryMock.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});

describe("GET /api/titulos/:capa/:objectid", () => {
  it("responde 404 si el título no existe, no un error genérico", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/titulos/modalidad_concesiones_forestales/999999999");
    expect(res.status).toBe(404);
  });

  it("responde el detalle real cuando existe, por capa+objectid", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          capa: "modalidad_concesiones_forestales",
          objectid: 16850,
          fuente: "DGFFS-DICFFS",
          doc_reg: null,
          fec_reg: null,
          observ: null,
          zon_utm: 18,
          origen: 5,
          nom_dis: "220602",
          nom_pro: "2206",
          nom_dep: "22",
          aut_for: 6,
          fec_ini: "2003-02-21",
          fec_ter: null,
          situac: 1,
          sup_sig: 29690.238,
          sup_apr: 29690,
          doc_leg: null,
          fec_leg: null,
          atributos_extra: null,
        },
      ],
    });

    const res = await request(createApp()).get("/api/titulos/modalidad_concesiones_forestales/16850");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ capa: "modalidad_concesiones_forestales", objectid: 16850 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/capa = \$1 AND objectid = \$2/);
    expect(params).toEqual(["modalidad_concesiones_forestales", 16850]);
  });

  it("rechaza una capa inválida en la ruta sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/titulos/capa-inventada/16850");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
