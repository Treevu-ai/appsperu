/**
 * Tests de contrato para GET /api/denuncias — SID-10 a SID-13.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

const FILA_EJEMPLO = {
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
  ubigeo: "130101",
  anio: 2025,
  mes: 7,
  modalidad: "Extorsión",
  cantidad: 42,
};

describe("GET /api/denuncias", () => {
  it("devuelve 200 con el universo completo sin filtros", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_EJEMPLO] });
    const res = await request(createApp()).get("/api/denuncias");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([FILA_EJEMPLO]);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).not.toMatch(/WHERE/i);
  });

  it("filtra por departamento", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_EJEMPLO] });
    const res = await request(createApp()).get("/api/denuncias").query({ departamento: "la libertad" });
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/departamento = \$1/);
    expect(params).toEqual(["LA LIBERTAD"]);
  });

  it("filtra por año", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/denuncias").query({ anio: "2025" });
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/anio = \$1/);
    expect(params).toEqual([2025]);
  });

  it("filtra por modalidad", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_EJEMPLO] });
    const res = await request(createApp()).get("/api/denuncias").query({ modalidad: "Extorsión" });
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/modalidad = \$1/);
    expect(params).toEqual(["Extorsión"]);
  });

  it("filtra por ubigeo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_EJEMPLO] });
    const res = await request(createApp()).get("/api/denuncias").query({ ubigeo: "130101" });
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/ubigeo = \$1/);
    expect(params).toEqual(["130101"]);
  });

  it("rechaza un ubigeo que no tiene 6 dígitos", async () => {
    const res = await request(createApp()).get("/api/denuncias").query({ ubigeo: "123" });
    expect(res.status).toBe(400);
  });

  it("rechaza un año que no tiene 4 dígitos", async () => {
    const res = await request(createApp()).get("/api/denuncias").query({ anio: "25" });
    expect(res.status).toBe(400);
  });

  it("combina departamento + año + modalidad en un solo WHERE con placeholders consecutivos", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ departamento: "LA LIBERTAD", anio: "2025", modalidad: "Extorsión" });
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/departamento = \$1 AND anio = \$2 AND modalidad = \$3/);
    expect(params).toEqual(["LA LIBERTAD", 2025, "Extorsión"]);
  });

  it("devuelve resultados vacío (no error) cuando la consulta no matchea nada", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/denuncias").query({ departamento: "DEPARTAMENTO_INEXISTENTE" });
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});
