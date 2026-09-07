import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /health", () => {
  it("responde ok sin tocar la base de datos", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("confirma la dependencia de base de datos antes de declararse listo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
  });

  it("no expone un error interno si la base de datos no está disponible", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not_ready", database: "unavailable" });
  });
});

describe("GET /api/ipress", () => {
  it("devuelve los resultados con la advertencia de cobertura nacional y metadata de paginación", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            cod_ipress: "00002806",
            institucion: "GOBIERNO REGIONAL",
            nombre: "LA NOVIA",
            clasificacion: "PUESTOS DE SALUD O POSTAS DE SALUD",
            tipo_establecimiento: "ESTABLECIMIENTO DE SALUD SIN INTERNAMIENTO",
            departamento: "MADRE DE DIOS",
            provincia: "TAHUAMANU",
            distrito: "TAHUAMANU",
            ubigeo: "170303",
            direccion: "CARRETERA IBERIA KM 80",
            categoria: "I-1",
            estado: "ACTIVO",
            norte: "-11.8671856",
            este: "-69.13774377",
            updated_at: "2026-09-05T00:00:00.000Z",
          },
        ],
      });

    const res = await request(createApp()).get("/api/ipress").query({ ubigeo: "170303" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 2000, offset: 0, hasMore: false });
    expect(res.body.cobertura).toMatch(/nacional/i);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({ codIpress: "00002806", estado: "ACTIVO", ubigeo: "170303" });
    expect(res.body.resultados[0].norte).toBeCloseTo(-11.8671856);

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("ubigeo = $1"), ["170303"]);
  });

  it("rechaza parámetros de consulta inválidos con 400", async () => {
    const res = await request(createApp()).get("/api/ipress").query({ ubigeo: "" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("sin filtros, consulta sin cláusula WHERE", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ipress");
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining("WHERE"), []);
  });

  it("filtra por departamento, normalizado a mayúsculas", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ipress").query({ departamento: "la libertad" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("departamento = $1"), ["LA LIBERTAD"]);
  });

  it("filtra por distrito, normalizado a mayúsculas", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ipress").query({ distrito: "trujillo" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("distrito = $1"), ["TRUJILLO"]);
  });

  it("filtra por estado, normalizado a mayúsculas", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ipress").query({ estado: "activo" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("estado = $1"), ["ACTIVO"]);
  });

  it("combina varios filtros en la misma consulta", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ipress").query({ departamento: "LA LIBERTAD", estado: "ACTIVO" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("AND"), ["LA LIBERTAD", "ACTIVO"]);
  });

  it("devuelve norte/este como null cuando la fuente no trae coordenadas", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [{ cod_ipress: "1", institucion: null, nombre: "X", clasificacion: null, tipo_establecimiento: null, departamento: null, provincia: null, distrito: null, ubigeo: null, direccion: null, categoria: null, estado: null, norte: null, este: null, updated_at: null }],
      });
    const res = await request(createApp()).get("/api/ipress");
    expect(res.body.resultados[0].norte).toBeNull();
    expect(res.body.resultados[0].este).toBeNull();
  });
});
