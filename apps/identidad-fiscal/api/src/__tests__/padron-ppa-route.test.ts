import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

// app.ts monta crossref.ts, que exige COMPRAS_DATABASE_URL y
// EJECUCION_DATABASE_URL al importarse (compras-pool.ts/ejecucion-pool.ts
// lanzan si faltan) — ninguna ruta de este archivo las usa, pero el import
// de app.js sí las evalúa.
process.env.COMPRAS_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.EJECUCION_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/padron-ppa", () => {
  it("lista registros y filtra por registrado=true", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [{ ruc: "20404057805", registrado: true, nombre_ppa: "ACOPAGRO", fecha_consulta: "2026-09-20T00:00:00.000Z" }],
      });

    const res = await request(createApp()).get("/api/padron-ppa").query({ registrado: "true" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toEqual({
      ruc: "20404057805",
      registrado: true,
      nombrePpa: "ACOPAGRO",
      fechaConsulta: "2026-09-20T00:00:00.000Z",
    });
    const [, params] = queryMock.mock.calls[1];
    expect(params).toContain(true);
  });
});

describe("GET /api/padron-ppa/:ruc", () => {
  it("devuelve 404 si el RUC no fue consultado contra el padrón", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/padron-ppa/20404057805");
    expect(res.status).toBe(404);
  });

  it("devuelve registrado=false para un RUC consultado pero no inscrito", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ruc: "20132489824", registrado: false, nombre_ppa: null, fecha_consulta: "2026-09-20T00:00:00.000Z" }],
    });
    const res = await request(createApp()).get("/api/padron-ppa/20132489824");
    expect(res.status).toBe(200);
    expect(res.body.registrado).toBe(false);
  });
});
