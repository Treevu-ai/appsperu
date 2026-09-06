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

describe("GET /api/cobertura", () => {
  it("devuelve resultados con la advertencia de cobertura nacional agregada", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ubigeo: "010101",
          fecha_corte: "2024-10-31",
          cunamas_cuidado_diurno: "96",
          cunamas_acompanamiento_familias: "90",
          juntos_hogares_afiliados: "493",
          juntos_hogares_abonados: "423",
          foncodes_usuarios_estimados: null,
          qaliwarma_ninos_atendidos: "5234",
          qaliwarma_iiee: "34",
          pension65_usuarios: "642",
          contigo_usuarios: "252",
          pais_tambos: null,
          pais_atenciones: null,
          pais_beneficiarios: null,
          updated_at: "2026-09-05T00:00:00.000Z",
        },
      ],
    });

    const res = await request(createApp()).get("/api/cobertura").query({ ubigeo: "010101" });

    expect(res.status).toBe(200);
    expect(res.body.cobertura).toMatch(/nacional/i);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({ ubigeo: "010101", pension65Usuarios: 642, foncodesUsuariosEstimados: null });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("ubigeo = $1"), ["010101"]);
  });

  it("filtra por fechaCorte cuando se especifica", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/cobertura").query({ fechaCorte: "2024-10-31" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("fecha_corte = $1"), ["2024-10-31"]);
  });

  it("rechaza un formato de fecha inválido con 400", async () => {
    const res = await request(createApp()).get("/api/cobertura").query({ fechaCorte: "31-10-2024" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("sin filtros, consulta sin cláusula WHERE (trae el último corte por distrito)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/cobertura");
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining("WHERE"), []);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("DISTINCT ON (ubigeo)"), []);
  });
});
