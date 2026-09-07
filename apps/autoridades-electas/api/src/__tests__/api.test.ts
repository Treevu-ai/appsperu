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

describe("GET /api/autoridades", () => {
  it("returns the list with a joined nombreCompleto, traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            nombres: "OSWAR ELBIS",
            apellido_paterno: "CAHUAZA",
            apellido_materno: "MITIVIRE",
            organizacion_politica: "JUNTOS POR EL PERU",
            cargo: "DIPUTADO",
            region: null,
            provincia: null,
            distrito: null,
            ubigeo: "250000",
            fecha_inicio_vigencia: "2026-07-28",
            fecha_fin_vigencia: "2031-07-27",
            proceso_electoral: "ELECCIONES GENERALES 2026",
            anio_eleccion: 2026,
            ambito: "NACIONAL",
            genero: "M",
            edad: 51,
            periodo: "PERIODO 2026 - 2031",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/autoridades").query({ cargo: "DIPUTADO" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({
      nombreCompleto: "OSWAR ELBIS CAHUAZA MITIVIRE",
      cargo: "DIPUTADO",
      ubigeo: "250000",
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/JNE/);
  });

  it("rejects an ubigeo that is not 6 digits instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/autoridades").query({ ubigeo: "25" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/api/autoridades");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });

  it("filters by nombre, organizacionPolitica, and anioEleccion", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app)
      .get("/api/autoridades")
      .query({ nombre: "CAHUAZA", organizacionPolitica: "JUNTOS", anioEleccion: 2026 });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/ILIKE/);
    expect(params).toContain(2026);
  });

  it("omits apellido_materno from nombreCompleto when it is null", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            nombres: "JUANA",
            apellido_paterno: "TICONA",
            apellido_materno: null,
            organizacion_politica: "PARTIDO CIVICO OBRAS",
            cargo: "SENADOR",
            region: null,
            provincia: null,
            distrito: null,
            ubigeo: null,
            fecha_inicio_vigencia: null,
            fecha_fin_vigencia: null,
            proceso_electoral: "ELECCIONES GENERALES 2026",
            anio_eleccion: 2026,
            ambito: "NACIONAL",
            genero: "F",
            edad: 62,
            periodo: "PERIODO 2026 - 2031",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });
    const app = createApp();
    const res = await request(app).get("/api/autoridades");
    expect(res.body.resultados[0].nombreCompleto).toBe("JUANA TICONA");
  });
});
