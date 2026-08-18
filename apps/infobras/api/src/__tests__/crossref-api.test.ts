import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const publicWorksQueryMock = vi.fn();
const investmentsQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: publicWorksQueryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: investmentsQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  publicWorksQueryMock.mockReset();
  investmentsQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
});

describe("GET /api/crossref", () => {
  it("returns an empty list without querying investments when there are no obras with CUI", async () => {
    publicWorksQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
    expect(investmentsQueryMock).not.toHaveBeenCalled();
  });

  it("joins obras aggregated by CUI with their matching investment", async () => {
    publicWorksQueryMock.mockResolvedValueOnce({
      rows: [{ cui: "2160111", obras: "1", obras_paralizadas: "1", avance_fisico_real_promedio: "58.10" }],
    });
    investmentsQueryMock.mockResolvedValueOnce({
      rows: [
        {
          cui: "2160111",
          nombre: "MEJORAMIENTO DEL SERVICIO DEPORTIVO",
          estado: "VIABLE",
          monto_viable: "120539327.00",
          costo_actualizado: "0.00",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([
      {
        cui: "2160111",
        obras: 1,
        obrasParalizadas: 1,
        avanceFisicoRealPromedio: 58.1,
        enInversiones: true,
        nombreInversion: "MEJORAMIENTO DEL SERVICIO DEPORTIVO",
        estadoInversion: "VIABLE",
        montoViableInversion: 120539327,
        costoActualizadoInversion: 0,
      },
    ]);
  });

  it("marks a CUI as not found in investments instead of dropping the row", async () => {
    publicWorksQueryMock.mockResolvedValueOnce({
      rows: [{ cui: "9999999", obras: "2", obras_paralizadas: "0", avance_fisico_real_promedio: null }],
    });
    investmentsQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.body.resultados[0]).toMatchObject({
      cui: "9999999",
      enInversiones: false,
      nombreInversion: null,
      montoViableInversion: null,
    });
  });
});

describe("GET /api/crossref/ejecucion", () => {
  it("returns an empty list without querying devengado/obras when the crosswalk is empty", async () => {
    publicWorksQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/ejecucion");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
    expect(ejecucionQueryMock).not.toHaveBeenCalled();
  });

  it("joins the persisted crosswalk with live devengado and obras paralizadas", async () => {
    publicWorksQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            ejecucion_entity_code: "001",
            ejecucion_nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
            infobras_codigo_entidad: "E-1",
            infobras_entidad_nombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
            confidence: "confirmada",
            score: "1.000",
            computed_at: "2026-08-17T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ codigo_entidad: "E-1", obras: "3", obras_paralizadas: "1" }],
      });
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "001", devengado: "500000" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref/ejecucion");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([
      {
        ejecucionEntityCode: "001",
        ejecucionNombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
        infobrasCodigoEntidad: "E-1",
        infobrasEntidadNombre: "MUNICIPALIDAD DISTRITAL DE ANGASMARCA",
        confidence: "confirmada",
        score: 1,
        devengado: 500000,
        obras: 3,
        obrasParalizadas: 1,
        computedAt: "2026-08-17T00:00:00.000Z",
      },
    ]);
  });

  it("responde 400 cuando confidence no es un valor válido", async () => {
    const app = createApp();
    const res = await request(app).get("/api/crossref/ejecucion?confidence=nope");

    expect(res.status).toBe(400);
    expect(publicWorksQueryMock).not.toHaveBeenCalled();
  });
});
