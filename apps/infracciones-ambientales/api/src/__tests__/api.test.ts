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
    const app = createApp();
    const res = await request(app).get("/health");
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

describe("GET /api/infracciones", () => {
  it("returns the list with masked/unmasked document info, traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            nombre_administrado: "COMPAÑIA MINERA AURIFERA SANTA ROSA S.A.",
            tipo_doc: "R.U.C.",
            id_doc_administrado: "20109989992",
            id_doc_enmascarado: false,
            unidad_fiscalizable: "Santa Rosa",
            subsector_economico: "Minería",
            departamento: "La Libertad",
            provincia: "Santiago De Chuco",
            distrito: "Angasmarca",
            nro_expediente: "0637-2019-OEFA/DFAI/PAS",
            nro_rd: "0216-2022-OEFA/DFAI",
            fecha_rd: "2022-02-28",
            detalle_infraccion: "...",
            tipo_sancion: "Multa",
            tipo_infraccion: "Compromisos y/o normas ambientales simples",
            medida_dictada: null,
            cantidad_multa: "13170.43",
            cantidad_infracciones: 13,
            fecha_corte: "2024-04-30",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/infracciones").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0].administrado).toMatchObject({ nombre: "COMPAÑIA MINERA AURIFERA SANTA ROSA S.A.", documentoEnmascarado: false });
    expect(res.body.resultados[0].cantidadMulta).toBe(13170.43);
    expect(res.body.resultados[0].fuente.dataset).toMatch(/OEFA/);
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/infracciones");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });

  it("filters by subsectorEconomico and administrado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/infracciones").query({ subsectorEconomico: "Minería", administrado: "SANTA ROSA" });
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][1]).toHaveLength(2);
  });
});
