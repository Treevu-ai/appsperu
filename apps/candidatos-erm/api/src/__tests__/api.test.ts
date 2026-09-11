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

describe("GET /api/candidatos", () => {
  it("masks the dni in the response and never returns it in full", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            dni: "47203008",
            nombre_completo: "PAUL ANTONIO MISAEL FLORES ROBLES",
            cargo: "ALCALDE DISTRITAL",
            tipo_eleccion: "MUNICIPAL DISTRITAL",
            organizacion_politica: "PARTIDO DEMOCRATICO SOMOS PERU",
            organizacion_estado: "INSCRITO",
            estado: "INSCRITO",
            ubigeo: "120103",
            departamento: "LIMA",
            provincia: "TRUJILLO",
            distrito: "LAREDO",
            posicion: 0,
            sexo: "M",
            edad: 34,
            provincia_consejero: null,
            sentencias_declaradas: 0,
            fetched_at: "2026-09-10T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/candidatos").query({ distrito: "LAREDO" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0].dniEnmascarado).toBe("*****008");
    expect(JSON.stringify(res.body)).not.toContain("47203008");
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Datapol/);
  });

  it("rejects a dni that is not 8 digits instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/candidatos").query({ dni: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized tipoEleccion instead of silently ignoring it", async () => {
    const app = createApp();
    const res = await request(app).get("/api/candidatos").query({ tipoEleccion: "NACIONAL" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("filters by departamento, cargo and estado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app)
      .get("/api/candidatos")
      .query({ departamento: "lima", cargo: "alcalde", estado: "inscrito" });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/ILIKE/);
    expect(params).toContain("LIMA");
    expect(params).toContain("INSCRITO");
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/candidatos");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});
