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

describe("GET /api/casos", () => {
  it("filtra siempre al snapshot más reciente (MAX(source_batch_id))", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/casos");
    const [countSql] = queryMock.mock.calls[0];
    const [listSql] = queryMock.mock.calls[1];
    expect(countSql).toMatch(/source_batch_id = \(SELECT MAX\(source_batch_id\) FROM violencia_escolar_casos\)/);
    expect(listSql).toMatch(/source_batch_id = \(SELECT MAX\(source_batch_id\) FROM violencia_escolar_casos\)/);
  });

  it("rechaza un tipoViolencia fuera del enum sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/casos").query({ tipoViolencia: "Otra" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            fecha_reporte: "2026-08-31",
            dre: "DRE Lima Metropolitana",
            ugel: "UGEL 07 San Borja",
            nivel_educativo: "Secundaria",
            tipo_reporte: "Personal IE a Escolares",
            tipo_violencia: "Sexual",
            subtipo_violencia: "Violación sexual",
            tipo_estado_reporte: "Atención en proceso",
          },
        ],
      });

    const res = await request(createApp()).get("/api/casos").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ dre: "DRE Lima Metropolitana", tipoViolencia: "Sexual" });
  });

  it("filtra por rango de fechas con fechaDesde/fechaHasta", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/casos").query({ fechaDesde: "2024-01-01", fechaHasta: "2024-12-31" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/fecha_reporte >= \$1/);
    expect(countSql).toMatch(/fecha_reporte <= \$2/);
    expect(countParams).toEqual(["2024-01-01", "2024-12-31"]);
  });
});

describe("GET /api/resumen", () => {
  it("sin dre, agrega por DRE a nivel nacional", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/resumen");
    expect(res.body.agregadoPor).toBe("dre");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/SELECT dre AS territorio/);
  });

  it("con dre, agrega por UGEL dentro de ese DRE", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/resumen").query({ dre: "La Libertad" });
    expect(res.body.agregadoPor).toBe("ugel");
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/SELECT ugel AS territorio/);
    expect(params).toEqual(["%La Libertad%"]);
  });
});
