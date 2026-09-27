/**
 * Tests para GET /api/meta/freshness — proveedores-sancionados.
 *
 * Pattern: mocks de pool, sin BD real.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));

// crossref.ts importa compras-pool.ts, fiscal-pool.ts y candidatos-pool.ts → necesitan mock
vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
});

describe("GET /api/meta/freshness", () => {
  it("nunca se ha ingestado → ultimaIngesta null, diasSinActualizar null, filasIngeridas 0", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp()).get("/api/meta/freshness");

    expect(res.status).toBe(200);
    expect(res.body.proveedoresSancionados.ultimaIngesta).toBeNull();
    expect(res.body.proveedoresSancionados.diasSinActualizar).toBeNull();
    expect(res.body.proveedoresSancionados.filasIngeridas).toBe(0);
  });

  it("última ingesta hoy (0 días) → diasSinActualizar 0", async () => {
    const ahora = new Date();
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        fuente: "tce_osce",
        ultima_ejecucion: ahora,
        filas_ingeridas: 494,
      }],
      rowCount: 1,
    });

    const res = await request(createApp()).get("/api/meta/freshness");

    expect(res.status).toBe(200);
    expect(res.body.proveedoresSancionados.ultimaIngesta).toBe(ahora.toISOString());
    expect(res.body.proveedoresSancionados.diasSinActualizar).toBe(0);
    expect(res.body.proveedoresSancionados.filasIngeridas).toBe(494);
  });

  it("última ingesta hace 3 días → diasSinActualizar 3", async () => {
    const hace3dias = new Date(Date.now() - 3 * 86_400_000);
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        fuente: "tce_osce",
        ultima_ejecucion: hace3dias,
        filas_ingeridas: 321,
      }],
      rowCount: 1,
    });

    const res = await request(createApp()).get("/api/meta/freshness");

    expect(res.status).toBe(200);
    expect(res.body.proveedoresSancionados.diasSinActualizar).toBe(3);
    expect(res.body.proveedoresSancionados.filasIngeridas).toBe(321);
  });

  it("siempre filtra por fuente tce_osce", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(createApp()).get("/api/meta/freshness");

    const sql = poolQueryMock.mock.calls[0][0];
    expect(sql).toMatch(/tce_osce/);
  });
});
