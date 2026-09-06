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

describe("GET /api/offset-agreements", () => {
  it("returns the list with traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          tipo_convenio: "Compensaciones Industriales y Sociales Offset",
          institucion: "Ministerio de Defensa",
          titulo: "Transferencia tecnológica",
          entidad_contraparte: "Textron Aviation",
          observacion: "En ejecución",
          anio_inicio: 2024,
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/offset-agreements");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ institucion: "Ministerio de Defensa", anioInicio: 2024 });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Offset/);
  });
});

describe("GET /api/training-abroad", () => {
  it("returns the list, coercing personalCantidad to a number", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          institucion: "CENTRO SUPERIOR DE ESTUDIOS DE LA DEFENSA NACIONAL DE ESPAÑA",
          capacitacion: "CURSO X",
          personal_cantidad: "2",
          fecha_inicio: "2026-05-11",
          fecha_termino: "2026-06-26",
          pais: "ESPAÑA",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/training-abroad").query({ pais: "ESPAÑA" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].personalCantidad).toBe(2);
  });
});

describe("GET /api/peace-missions", () => {
  it("returns the list filtered by año", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          mision: "MINUSCA",
          modalidad: "Oficial de Estado Mayor",
          institucion: "Ejército del Perú (EP)",
          pais: "República Centroafricana",
          anio: 2025,
          cantidad: "1",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/peace-missions").query({ anio: 2025 });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ mision: "MINUSCA", anio: 2025, cantidad: 1 });
  });

  it("rejects an invalid año instead of querying the database", async () => {
    const app = createApp();
    const res = await request(app).get("/api/peace-missions").query({ anio: 1500 });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
