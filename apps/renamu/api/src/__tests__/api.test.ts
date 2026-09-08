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

describe("GET /api/municipalidades", () => {
  it("returns the list with a human-readable tipomuni and traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          idmunici: "010101",
          anio: 2024,
          ubigeo: "010101",
          departamento: "AMAZONAS",
          provincia: "CHACHAPOYAS",
          distrito: "CHACHAPOYAS",
          tipomuni: "1",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/municipalidades").query({ departamento: "AMAZONAS" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ ubigeo: "010101", tipomuni: "Provincial" });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/RENAMU/);
  });

  it("rejects an ubigeo that is not 6 digits instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/municipalidades").query({ ubigeo: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("DQ-16: sin anio/historico, filtra al año más reciente por defecto — evita duplicar cada municipalidad una vez por año ingerido", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/municipalidades").query({ departamento: "LA LIBERTAD" });
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/m\.anio = \(SELECT MAX\(anio\) FROM renamu_municipalidades\)/);
  });

  it("DQ-16: historico=true trae todos los años", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/municipalidades").query({ historico: "true" });
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/MAX\(anio\)/);
  });

  it("DQ-16: anio explícito filtra a ese año exacto, no al más reciente", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/municipalidades").query({ anio: "2024" });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/m\.anio = \$1/);
    expect(params).toEqual([2024]);
  });
});

describe("GET /api/equipamiento", () => {
  it("requires ubigeo", async () => {
    const app = createApp();
    const res = await request(app).get("/api/equipamiento");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 404 when there is no RENAMU data for the ubigeo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/equipamiento").query({ ubigeo: "010101" });
    expect(res.status).toBe(404);
  });

  it("returns vehículos and conectividad for a known municipality", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 1, anio: 2024, ubigeo: "010101", departamento: "AMAZONAS", provincia: "CHACHAPOYAS", distrito: "CHACHAPOYAS" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            item_codigo: "P11A_1",
            item_descripcion: "Auto y/o camioneta",
            tiene: true,
            cantidad_operativa: "12",
            cantidad_no_operativa: "0",
            especifique: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            tiene_linea_fija: true,
            lineas_fijas: "1",
            tiene_linea_movil: true,
            lineas_moviles: "1",
            tiene_internet: true,
            computadoras_con_internet: "135",
            tipo_conexion_codigo: 4,
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/equipamiento").query({ ubigeo: "010101" });

    expect(res.status).toBe(200);
    expect(res.body.vehiculos[0]).toMatchObject({ item: "Auto y/o camioneta", tiene: true, cantidadOperativa: 12 });
    expect(res.body.conectividad).toMatchObject({ tieneInternet: true, computadorasConInternet: 135 });
  });
});
