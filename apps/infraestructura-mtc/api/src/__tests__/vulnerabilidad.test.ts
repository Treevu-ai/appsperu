/**
 * Tests de CONTRATO para el endpoint /api/terminales/vulnerabilidad.
 * PRD-004 · Épica 4, Historia 4.2 — VUL-06 a VUL-10
 *
 * El endpoint NO EXISTE AÚN. Estos tests definen el contrato
 * que la implementación debe cumplir (TDD).
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

const TERMINALES_FIJOS = [
  {
    codigo_puerto: "CALLAO-001",
    nombre_terminal: "TERMINAL PORTUARIO DEL CALLAO",
    departamento: "CALLAO",
    ambito: "MARITIMO",
    es_concesionado: true,
    estado_conservacion: "Bueno",
    score_vulnerabilidad: 22.5,
    componentes: { estado: 25, concesion: 20, alcance: 15, ambito: 10, geolocalizacion: 0 },
    fuente_datos: "MTC_2025",
    actualizado_en: "2025-12-31",
  },
  {
    codigo_puerto: "IQUITOS-042",
    nombre_terminal: "EMBARCADERO FLUVIAL IQUITOS",
    departamento: "LORETO",
    ambito: "FLUVIAL",
    es_concesionado: false,
    estado_conservacion: "Información no disponible",
    score_vulnerabilidad: 75.0,
    componentes: { estado: 0, concesion: 0, alcance: 5, ambito: 10, geolocalizacion: 0 },
    fuente_datos: "MTC_2025",
    actualizado_en: "2025-12-31",
  },
];

describe.skip("GET /api/terminales/vulnerabilidad — CONTRATO", () => {
  it("devuelve 200 con ranking de vulnerabilidad", async () => {
    queryMock.mockResolvedValueOnce({ rows: TERMINALES_FIJOS, rowCount: 2 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("resultados");
    expect(Array.isArray(res.body.resultados)).toBe(true);
  });

  it("cada resultado incluye los campos requeridos del índice", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TERMINALES_FIJOS[0]], rowCount: 1 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    const t = res.body.resultados[0];
    expect(t).toHaveProperty("codigo_puerto");
    expect(t).toHaveProperty("score_vulnerabilidad");
    expect(t).toHaveProperty("componentes");
    expect(t).toHaveProperty("fuente_datos");
    expect(t).toHaveProperty("actualizado_en");
    expect(t).toHaveProperty("departamento");
    expect(t).toHaveProperty("ambito");
  });

  it("ordena por score_vulnerabilidad descendente (más vulnerable primero)", async () => {
    queryMock.mockResolvedValueOnce({ rows: TERMINALES_FIJOS, rowCount: 2 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    expect(res.body.resultados[0].score_vulnerabilidad).toBeGreaterThan(
      res.body.resultados[1].score_vulnerabilidad
    );
  });

  it("filtra por departamento correctamente", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TERMINALES_FIJOS[1]], rowCount: 1 });
    const res = await request(createApp())
      .get("/api/terminales/vulnerabilidad")
      .query({ departamento: "LORETO" });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].departamento).toBe("LORETO");
  });

  it("filtra por ámbito correctamente", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TERMINALES_FIJOS[1]], rowCount: 1 });
    const res = await request(createApp())
      .get("/api/terminales/vulnerabilidad")
      .query({ ambito: "FLUVIAL" });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].ambito).toBe("FLUVIAL");
  });

  it("devuelve resultado vacío para departamento sin terminales", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .get("/api/terminales/vulnerabilidad")
      .query({ departamento: "MOQUEGUA" });
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });

  it("incluye metadata de generación", async () => {
    queryMock.mockResolvedValueOnce({ rows: TERMINALES_FIJOS, rowCount: 2 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    expect(res.body).toHaveProperty("generadoEn");
    expect(res.body).toHaveProperty("total");
  });

  it("incluye score en rango 0-100", async () => {
    queryMock.mockResolvedValueOnce({ rows: TERMINALES_FIJOS, rowCount: 2 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    for (const t of res.body.resultados) {
      expect(t.score_vulnerabilidad).toBeGreaterThanOrEqual(0);
      expect(t.score_vulnerabilidad).toBeLessThanOrEqual(100);
    }
  });

  it("detalle de terminal por código devuelve 200 con todos los componentes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TERMINALES_FIJOS[0]], rowCount: 1 });
    const res = await request(createApp())
      .get("/api/terminales/vulnerabilidad/CALLAO-001");
    expect(res.status).toBe(200);
    expect(res.body.codigo_puerto).toBe("CALLAO-001");
    expect(res.body.componentes).toHaveProperty("estado");
    expect(res.body.componentes).toHaveProperty("concesion");
    expect(res.body.componentes).toHaveProperty("alcance");
    expect(res.body.componentes).toHaveProperty("ambito");
    expect(res.body.componentes).toHaveProperty("geolocalizacion");
  });

  it("detalle de terminal inexistente devuelve 404 con mensaje de error", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .get("/api/terminales/vulnerabilidad/INEXISTENTE-999");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("el score total es la suma ponderada de los componentes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [TERMINALES_FIJOS[0]], rowCount: 1 });
    const res = await request(createApp()).get("/api/terminales/vulnerabilidad");
    const t = res.body.resultados[0];
    const suma = Object.values(t.componentes as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    expect(t.score_vulnerabilidad).toBeCloseTo(suma, 1);
  });
});
