import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: vi.fn() },
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

describe("GET /api/investments", () => {
  it("returns the list with traceability, pagination metadata, and applies the departamento filter", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            cui: "2716769",
            codigo_snip: "2716769",
            nombre: "MEJORAMIENTO DEL SERVICIO DE PROVISIÓN DE AGUA",
            sec_ejec: "300790",
            nombre_uep: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
            entidad: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
            sector: "GOBIERNOS LOCALES",
            nivel: "GL",
            estado: "ACTIVO",
            situacion: "VIABLE",
            departamento: "LA LIBERTAD",
            provincia: "TRUJILLO",
            distrito: "TRUJILLO",
            monto_viable: "1853953.50",
            costo_actualizado: "2100000.00",
            funcion: "SANEAMIENTO",
            tipo_inversion: "PROYECTO DE INVERSION",
            fecha_registro: "2022-01-05",
            fecha_viabilidad: "2022-03-10",
            fetched_at: "2026-08-17T00:00:00.000Z",
          },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/investments").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 1000, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toMatchObject({
      cui: "2716769",
      montoViable: 1853953.5,
      costoActualizado: 2100000,
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/Invierte/);

    const [, countParams] = queryMock.mock.calls[0];
    expect(countParams).toEqual(["LA LIBERTAD"]);
    const [, listParams] = queryMock.mock.calls[1];
    expect(listParams).toEqual(["LA LIBERTAD", 1000, 0]);
  });

  it("respeta limit/offset y calcula hasMore cuando quedan más filas", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "7998" }] })
      .mockResolvedValueOnce({ rows: [{ cui: "1", nombre: "X", fetched_at: "2026-08-17T00:00:00.000Z" }] });

    const app = createApp();
    const res = await request(app)
      .get("/api/investments")
      .query({ departamento: "LA LIBERTAD", limit: 5000, offset: 5000 });

    expect(res.status).toBe(200);
    // offset(5000) + rows devueltas(1) = 5001 < total(7998) -> todavía quedan filas
    expect(res.body).toMatchObject({ total: 7998, limit: 5000, offset: 5000, hasMore: true });

    const [, listParams] = queryMock.mock.calls[1];
    expect(listParams).toEqual(["LA LIBERTAD", 5000, 5000]);
  });
});

describe("GET /api/investments (validación de query)", () => {
  it("responde 400 cuando departamento llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/investments?departamento=a&departamento=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 400 cuando limit excede el máximo permitido", async () => {
    const app = createApp();
    const res = await request(app).get("/api/investments?limit=5001");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 400 cuando offset es negativo", async () => {
    const app = createApp();
    const res = await request(app).get("/api/investments?offset=-1");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/investments/:cui", () => {
  it("returns 404 when the investment was not ingested", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/investments/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrada/);
  });

  it("returns the investment detail with traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          cui: "2716769",
          codigo_snip: null,
          nombre: "MEJORAMIENTO DEL SERVICIO",
          sec_ejec: "300790",
          nombre_uep: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
          entidad: null,
          sector: null,
          nivel: null,
          estado: "ACTIVO",
          situacion: "VIABLE",
          departamento: "LA LIBERTAD",
          provincia: null,
          distrito: null,
          monto_viable: null,
          costo_actualizado: null,
          funcion: null,
          tipo_inversion: null,
          fecha_registro: null,
          fecha_viabilidad: null,
          fetched_at: "2026-08-17T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/investments/2716769");

    expect(res.status).toBe(200);
    expect(res.body.montoViable).toBeNull();
    expect(res.body.nombreUep).toMatch(/OLLANTAYTAMBO/);
  });
});
