import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
});

describe("GET /api/crossref (informes-control)", () => {
  it("cruza una entidad con informes reales, agrega devengado, y nunca expone nombres de personas", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "E1", nombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ entidad: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO", total_informes: "3", informes_con_responsabilidad: "1" }],
    });
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "E1", devengado: "1500000" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({
      entityCode: "E1",
      totalInformes: 3,
      informesConResponsabilidad: 1,
      devengadoTotal: 1500000,
      confidence: "confirmada",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/funcionario/i);
  });

  it("devuelve resultados vacíos sin llamar al matcher si no hay entidades o informes", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.resultados).toEqual([]);
    // Solo 2 llamadas (entities + informes) — no llegó a pedir devengado.
    expect(ejecucionQueryMock).toHaveBeenCalledTimes(1);
  });

  it("acepta un departamento distinto de La Libertad por query param", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref").query({ departamento: "san martin" });

    expect(ejecucionQueryMock).toHaveBeenCalledWith(expect.any(String), ["SAN MARTIN"]);
    expect(poolQueryMock).toHaveBeenCalledWith(expect.any(String), ["SAN MARTIN"]);
  });

  it("sin match entre entidades e informes: resultados vacíos, sin fabricar cruces", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "E9", nombre: "MUNICIPALIDAD DISTRITAL DE AGALLPAMPA" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ entidad: "MUNICIPALIDAD DISTRITAL DE CHILIA", total_informes: "1", informes_con_responsabilidad: "0" }],
    });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.resultados).toEqual([]);
  });
});
