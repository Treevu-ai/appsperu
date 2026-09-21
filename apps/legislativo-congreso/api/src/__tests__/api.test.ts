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

describe("GET /api/proyectos", () => {
  it("sin filtros, consulta sin condición WHERE forzada (no hay 'batch más reciente' -- la clave real es per_par_id+pley_num)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/proyectos");
    const [countSql] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/WHERE TRUE/);
  });

  it("filtra por periodo exacto", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/proyectos").query({ periodo: 2021 });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/per_par_id = \$1/);
    expect(countParams).toEqual([2021]);
  });

  it("rechaza un periodo no numérico sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/proyectos").query({ periodo: "no-es-numero" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve resultados con hasMore calculado a partir de total y offset", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            per_par_id: 2021,
            pley_num: 14864,
            proyecto_ley: "14864/2025-CR",
            estado: "PRESENTADO",
            fecha_presentacion: "2026-07-22",
            titulo: "PROYECTO DE LEY...",
            proponente: "Congreso",
            autores: "Luque Ibarra, Ruth",
            cod_tipo_parl: "C",
            cod_tipo_parl_actual: "C",
          },
        ],
      });

    const res = await request(createApp()).get("/api/proyectos").query({ limit: 1, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.resultados[0]).toMatchObject({ pleyNum: 14864, estado: "PRESENTADO" });
  });

  it("filtra por autor con ILIKE parcial", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/proyectos").query({ autor: "Luque" });
    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/autores ILIKE \$1/);
    expect(countParams).toEqual(["%Luque%"]);
  });
});

describe("GET /api/proyectos/periodos", () => {
  it("expone qué periodos están disponibles, con conteo de la última ingesta", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ per_par_id: 2021, ultima_ingesta: "2026-09-21T12:00:00Z", proyectos_en_ultima_ingesta: "14864" }],
    });

    const res = await request(createApp()).get("/api/proyectos/periodos");

    expect(res.status).toBe(200);
    expect(res.body.periodos[0]).toMatchObject({ perParId: 2021, disponible: true, proyectosEnUltimaIngesta: 14864 });
  });

  it("usa DISTINCT ON por periodo para que fecha y conteo vengan del mismo batch, no de un MAX() mezclado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/proyectos/periodos");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/DISTINCT ON \(per_par_id\)/);
    expect(sql).not.toMatch(/MAX\(/);
  });
});

describe("GET /api/proyectos/:periodo/:numero", () => {
  it("responde 404 si el proyecto no existe, no un error genérico", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/proyectos/2021/99999999");
    expect(res.status).toBe(404);
  });

  it("responde el detalle real cuando existe, usando periodo+numero (no el código con '/')", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          per_par_id: 2021,
          pley_num: 14864,
          proyecto_ley: "14864/2025-CR",
          estado: "PRESENTADO",
          fecha_presentacion: "2026-07-22",
          titulo: "PROYECTO DE LEY...",
          proponente: "Congreso",
          autores: "Luque Ibarra, Ruth",
          cod_tipo_parl: "C",
          cod_tipo_parl_actual: "C",
        },
      ],
    });

    const res = await request(createApp()).get("/api/proyectos/2021/14864");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ perParId: 2021, pleyNum: 14864, proyectoLey: "14864/2025-CR" });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/per_par_id = \$1 AND pley_num = \$2/);
    expect(params).toEqual([2021, 14864]);
  });

  it("rechaza numero no entero sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/proyectos/2021/no-es-numero");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
