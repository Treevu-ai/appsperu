import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /health", () => {
  it("responde ok sin tocar la base de datos", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("confirma la dependencia de base de datos antes de declararse listo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
  });

  it("no expone un error interno si la base de datos no está disponible", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not_ready", database: "unavailable" });
  });
});

describe("GET /api/empresas", () => {
  it("devuelve resultados con la advertencia de cobertura y vigencia", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", distrito: "TRUJILLO", anio: 2022, mes: 12, numero_empresas: "10660", updated_at: "2026-09-05T00:00:00.000Z" }],
    });

    const res = await request(createApp()).get("/api/empresas").query({ ubigeo: "130101" });

    expect(res.status).toBe(200);
    expect(res.body.cobertura).toMatch(/2022/);
    expect(res.body.resultados[0]).toMatchObject({ ubigeo: "130101", numeroEmpresas: 10660 });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("ubigeo = $1"), ["130101"]);
  });

  it("filtra por anio y mes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/empresas").query({ anio: "2022", mes: "12" });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("anio = $1");
    expect(sql).toContain("mes = $2");
    expect(params).toEqual([2022, 12]);
  });

  it("rechaza un mes fuera de rango con 400", async () => {
    const res = await request(createApp()).get("/api/empresas").query({ mes: "13" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
