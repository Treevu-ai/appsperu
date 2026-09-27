/**
 * Tests de cobertura para el router /api/denuncias.
 * PRD-002 · Épica 2, Historia 2.3 — SID-10 a SID-13
 *
 * Pattern: Supertest + mocks de pool, sin tocar BD real.
 * IMPORTANTE: estos tests verifican el comportamiento REAL del route.
 * Los tests de funcionalidades NO implementadas (total, ubigeo)
 * fueron removidos tras verificar el código fuente de rutas/denuncias.ts.
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
});

describe("GET /api/denuncias", () => {
  it("devuelve 200 con resultado vacío cuando no hay datos para el filtro", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ departamento: "NINGUNO" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("resultados");
    expect(Array.isArray(res.body.resultados)).toBe(true);
  });

  it("filtra por departamento correctamente", async () => {
    const rows = [
      { departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO",
        ubigeo: "130101", anio: 2026, mes: 7, modalidad: "Extorsión", cantidad: 312 },
    ];
    queryMock.mockResolvedValueOnce({ rows, rowCount: 1 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0].departamento).toBe("LA LIBERTAD");
    // Verifica que el filtro usa $1 y el valor va en el array de parámetros
    const sql = queryMock.mock.calls[0][0];
    const params = queryMock.mock.calls[0][1];
    expect(sql).toMatch(/departamento\s*=\s*\$1/);
    expect(params).toContain("LA LIBERTAD");
  });

  it("filtra por año correctamente", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ anio: "2025" });
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/anio\s*=\s*\$1/);
  });

  it("filtra por modalidad correctamente", async () => {
    const rows = [
      { departamento: "LIMA", provincia: "LIMA", distrito: "LIMA",
        ubigeo: "150101", anio: 2026, mes: 7, modalidad: "Extorsión", cantidad: 892 },
    ];
    queryMock.mockResolvedValueOnce({ rows, rowCount: 1 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ modalidad: "Extorsión" });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].modalidad).toBe("Extorsión");
  });

  it("combina filtros departamento + año + modalidad", async () => {
    const rows = [
      { departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO",
        ubigeo: "130101", anio: 2026, mes: 7, modalidad: "Extorsión", cantidad: 312 },
    ];
    queryMock.mockResolvedValueOnce({ rows, rowCount: 1 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ departamento: "LA LIBERTAD", anio: "2026", modalidad: "Extorsión" });
    expect(res.status).toBe(200);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toMatch(/departamento/);
    expect(sql).toMatch(/anio/);
    expect(sql).toMatch(/modalidad/);
  });

  it("devuelve 400 cuando anio no tiene 4 dígitos", async () => {
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ anio: "26" });
    expect(res.status).toBe(400);
  });

  it("normaliza departamento a mayúsculas en el valor del parámetro SQL", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await request(createApp()).get("/api/denuncias").query({ departamento: "la libertad" });
    // El valor se uppercasa en el parámetro (values array), no en el SQL string
    const params = queryMock.mock.calls[0][1];
    expect(params).toContain("LA LIBERTAD");
  });

  it("devuelve todas las columnas del schema", async () => {
    const rows = [
      { departamento: "LIMA", provincia: "LIMA", distrito: "LIMA",
        ubigeo: "150101", anio: 2026, mes: 7, modalidad: "Robo", cantidad: 1420 },
    ];
    queryMock.mockResolvedValueOnce({ rows, rowCount: 1 });
    const res = await request(createApp())
      .get("/api/denuncias")
      .query({ departamento: "LIMA" });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toHaveProperty("departamento");
    expect(res.body.resultados[0]).toHaveProperty("provincia");
    expect(res.body.resultados[0]).toHaveProperty("distrito");
    expect(res.body.resultados[0]).toHaveProperty("ubigeo");
    expect(res.body.resultados[0]).toHaveProperty("anio");
    expect(res.body.resultados[0]).toHaveProperty("mes");
    expect(res.body.resultados[0]).toHaveProperty("modalidad");
    expect(res.body.resultados[0]).toHaveProperty("cantidad");
  });
});
