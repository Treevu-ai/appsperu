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

describe("GET /api/exportaciones-fob", () => {
  it("lista exportaciones paginadas con los filtros aplicados", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20404057805",
            anio: 2025,
            mes: 8,
            aduana_codigo: "070",
            aduana_nombre: "ADUANA MARITIMA DEL CALLAO",
            agente_codigo: "0126",
            agente_nombre: "AGENCIA X",
            pais_codigo: "US",
            pais_nombre: "ESTADOS UNIDOS",
            fob_usd: "18616318.71",
            fecha_consulta: "2026-09-19T00:00:00.000Z",
          },
        ],
      });

    const res = await request(createApp()).get("/api/exportaciones-fob").query({ ruc: "20404057805", anio: 2025 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0].fobUsd).toBe(18616318.71);
    expect(typeof res.body.resultados[0].fobUsd).toBe("number");
  });

  it("rechaza un RUC que no tiene 11 dígitos sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/exportaciones-fob").query({ ruc: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/exportaciones-fob/resumen/:ruc", () => {
  it("agrega el FOB por año para un RUC", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { anio: 2025, fob_total: "18616318.71", embarques: "12" },
        { anio: 2024, fob_total: "9200000.00", embarques: "9" },
      ],
    });

    const res = await request(createApp()).get("/api/exportaciones-fob/resumen/20404057805");

    expect(res.status).toBe(200);
    expect(res.body.ruc).toBe("20404057805");
    expect(res.body.porAnio).toEqual([
      { anio: 2025, fobTotalUsd: 18616318.71, embarques: 12 },
      { anio: 2024, fobTotalUsd: 9200000, embarques: 9 },
    ]);
  });

  it("devuelve 404 cuando el RUC no tiene exportaciones registradas", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/exportaciones-fob/resumen/20404057805");
    expect(res.status).toBe(404);
  });
});
