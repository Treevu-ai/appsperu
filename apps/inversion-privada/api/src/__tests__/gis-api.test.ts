import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/gis/geojson", () => {
  it("devuelve un FeatureCollection válido sin filtro", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo: "PUN-418",
          id_proyecto: 244,
          nombre_proyecto: "Concesión Única de Telecomunicaciones",
          sector: "Telecomunicaciones",
          fase: "Ejecución Contractual",
          tipo_proyecto: "APP",
          departamentos_inei: [],
          tipo_coordenada: "Punto",
          geometry: { type: "Point", coordinates: [-77.11, -12.07] },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/gis/geojson");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("FeatureCollection");
    expect(res.body.features).toHaveLength(1);
    expect(res.body.features[0]).toMatchObject({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.11, -12.07] },
      properties: { codigo: "PUN-418", idProyecto: 244 },
    });
  });

  it("resuelve el nombre de departamento al código INEI antes de filtrar", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/gis/geojson").query({ departamento: "La Libertad" });

    expect(res.status).toBe(200);
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["13"]);
  });

  it("responde 400 para un departamento desconocido, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/gis/geojson").query({ departamento: "NARNIA" });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/gis/projects/:vertixId", () => {
  it("responde 400 para un vertixId inválido", async () => {
    const app = createApp();
    const res = await request(app).get("/api/gis/projects/abc");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve un FeatureCollection filtrado por id_proyecto", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo: "PUN-1",
          id_proyecto: 509,
          nombre_proyecto: "Red vial Nº 5",
          sector: "Transporte",
          fase: "Ejecución Contractual",
          tipo_proyecto: "APP",
          departamentos_inei: ["13", "15"],
          tipo_coordenada: "Línea",
          geometry: { type: "LineString", coordinates: [[-77, -12], [-78, -11]] },
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/gis/projects/509");

    expect(res.status).toBe(200);
    expect(res.body.features).toHaveLength(1);
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([509]);
  });
});
