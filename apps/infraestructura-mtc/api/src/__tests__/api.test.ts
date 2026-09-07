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

describe("GET /api/terminales-portuarios", () => {
  it("returns the list with traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigo_puerto: "131SVY1",
            nombre_terminal: "Multipropósito de Salaverry",
            ambito: "Marítimo",
            tipo_terminal: "Terminal Portuario",
            alcance: "Nacional",
            uso: "Público",
            trafico: "General",
            actividad: "Multipropósito",
            estado: "Operativo",
            estado_conservacion: "Bueno",
            titularidad: "Público (Concesionado)",
            administrador: "SALAVERRY TERMINAL INTERNACIONAL S.A.",
            es_concesionado: true,
            latitud: "-8.227368334",
            longitud: "-78.98310972",
            fecha_corte: "2025-12-31",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const res = await request(createApp()).get("/api/terminales-portuarios").query({ idDepartamento: "13" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 500, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({ codigoPuerto: "131SVY1", esConcesionado: true });
    expect(res.body.resultados[0].ubicacion.latitud).toBeCloseTo(-8.227368334);
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Portuaria/);
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/terminales-portuarios");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});

describe("GET /api/aerodromos", () => {
  it("returns the list with traceability and pagination metadata", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigo_aerodromo: "1311TRU",
            nombre: "Cap. FAP. Carlos Martinez de Pinillos",
            departamento: "La Libertad",
            provincia: "Trujillo",
            distrito: "Huanchaco",
            tipo_aerodromo: "Aeropuerto Internacional",
            codigo_oaci: "SPRU",
            escala: "Internacional",
            estado: "Operativo",
            administrador: "Aeropuertos del Perú S.A.",
            jerarquia: "Nacional",
            titularidad: "Pública (Concesionada)",
            es_concesionado: true,
            latitud: "-8.081708",
            longitud: "-79.108644",
            fecha_corte: "2025-12-31",
            fetched_at: "2026-09-06T00:00:00.000Z",
          },
        ],
      });

    const res = await request(createApp()).get("/api/aerodromos").query({ idDepartamento: "13" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 500, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({ codigoAerodromo: "1311TRU", provincia: "Trujillo" });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Aeroportuaria/);
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/aerodromos");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});

describe("GET /api/peajes", () => {
  it("returns the list with traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo_peaje: "13PE1NVIR1",
          nombre: "Virú",
          codigo_ruta: "PE-1N",
          inicio_km: "529.5",
          departamento: "LA LIBERTAD",
          provincia: "VIRÚ",
          distrito: "VIRÚ",
          localidad: "CASERIO VICTOR R HAYA",
          es_concesionado: true,
          titular: "Pública (concesionada)",
          ubicacion: "Panamericana Norte km 529+500",
          estado: "Operativo",
          administrador: "Autopista del Norte S.A.C (AUNOR)",
          latitud: "-8.4",
          longitud: "-79.0",
          fecha_corte: "2025-12-31",
          fetched_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    });

    const res = await request(createApp()).get("/api/peajes").query({ idDepartamento: "13" });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ codigoPeaje: "13PE1NVIR1", inicioKm: 529.5 });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Peaje/);
  });

  it("returns an empty list without filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/peajes");
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([]);
  });
});
