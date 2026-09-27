/**
 * Tests de CONTRATO para el endpoint /api/denuncias/termometro.
 * PRD-002 · Épica 2, Historia 2.2 — SID-05 a SID-09
 *
 * El endpoint NO EXISTE AÚN. Estos tests definen el contrato
 * que la implementación debe cumplir (TDD).
 *
 * Corte: z > 3 → CRÍTICO | z > 2 → ALERTA | z > 1 → NORMAL | else → BAJO
 *
 * Una vez implementado el endpoint, quitar el .skip de cada test.
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

// ---- Fixtures ----

// Historial 2022-2025: media = 200, std ~15 por mes de julio
const HISTORIAL_ROWS = Array.from({ length: 4 }, (_, i) => ({
  anio: 2022 + i, mes: 7, cantidad: 200, tasa_100k: 10.0,
}));

// Caso spike: cantidad = 312 → z = (312-200)/15 ≈ 7.5 → CRÍTICO
const SPIKE_ACTUAL = {
  anio: 2026, mes: 7, cantidad: 312, tasa_100k: 15.6,
  z_score: 7.47, nivel: "CRÍTICO", percentil: 98,
};

describe.skip("GET /api/denuncias/termometro — CONTRATO", () => {
  it("devuelve 400 cuando falta el parámetro requerido departamento", async () => {
    const res = await request(createApp()).get("/api/denuncias/termometro");
    expect(res.status).toBe(400);
  });

  it("devuelve 200 con estructura completa para departamento existente", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS }) // historial
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] }); // actual
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("departamento");
    expect(res.body).toHaveProperty("generadoEn");
    expect(res.body.series).toHaveProperty("historico");
    expect(res.body.series).toHaveProperty("actual");
    expect(res.body.series.actual).toHaveProperty("z_score");
    expect(res.body.series.actual).toHaveProperty("nivel");
  });

  it("clasifica z > 3 como CRÍTICO", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body.series.actual.nivel).toBe("CRÍTICO");
    expect(res.body.series.actual.z_score).toBeGreaterThan(3);
  });

  it("clasifica z entre 2 y 3 como ALERTA", async () => {
    const alerta = { ...SPIKE_ACTUAL, cantidad: 245, z_score: 3.0, nivel: "ALERTA" };
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [alerta] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body.series.actual.nivel).toBe("ALERTA");
  });

  it("clasifica z entre 1 y 2 como NORMAL", async () => {
    const normal = { ...SPIKE_ACTUAL, cantidad: 220, z_score: 1.33, nivel: "NORMAL" };
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [normal] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body.series.actual.nivel).toBe("NORMAL");
    expect(res.body.series.actual.z_score).toBeGreaterThan(1);
    expect(res.body.series.actual.z_score).toBeLessThanOrEqual(2);
  });

  it("clasifica z <= 1 como BAJO", async () => {
    const bajo = { ...SPIKE_ACTUAL, cantidad: 210, z_score: 0.67, nivel: "BAJO" };
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [bajo] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body.series.actual.nivel).toBe("BAJO");
    expect(res.body.series.actual.z_score).toBeLessThanOrEqual(1);
  });

  it("incluye variación interanual y mensual en comparativo", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body).toHaveProperty("comparativo");
    expect(res.body.comparativo).toHaveProperty("variacion_interanual_pct");
    expect(res.body.comparativo).toHaveProperty("variacion_mensual_pct");
  });

  it("incluye benchmark departamental", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD" });
    expect(res.body).toHaveProperty("benchmark");
    expect(Array.isArray(res.body.benchmark)).toBe(true);
  });

  it("filtra por modalidad cuando se pasa el parámetro", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD", modalidad: "Extorsión" });
    expect(res.status).toBe(200);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toMatch(/modalidad/);
  });

  it("filtra por año cuando se pasa el parámetro", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: HISTORIAL_ROWS })
      .mockResolvedValueOnce({ rows: [SPIKE_ACTUAL] });
    const res = await request(createApp())
      .get("/api/denuncias/termometro")
      .query({ departamento: "LA LIBERTAD", anio: "2025" });
    expect(res.status).toBe(200);
    const sql = queryMock.mock.calls[0][0];
    expect(sql).toMatch(/anio/);
  });
});
