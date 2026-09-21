import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

// Archivo separado (vi.mock es por archivo): prueba el camino sin
// COMPRAS_DATABASE_URL configurada -- comprasPool es `null` (ver
// db/external-pools.ts).
vi.mock("../db/external-pools.js", () => ({
  comprasPool: null,
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/crossref sin COMPRAS_DATABASE_URL configurada", () => {
  it("responde ENRIQUECIMIENTO_NO_CONFIGURADO sin tocar la base propia ni romper el endpoint", async () => {
    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", total: 0, resultados: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
