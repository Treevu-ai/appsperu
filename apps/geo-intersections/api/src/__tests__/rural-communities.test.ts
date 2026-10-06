import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock, connect: connectMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
});

describe("GET /api/communities", () => {
  it("devuelve 400 con limit no numérico, sin tocar la base", async () => {
    const res = await request(createApp()).get("/api/communities").query({ limit: "abc" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con limit por encima del máximo permitido (1000)", async () => {
    const res = await request(createApp()).get("/api/communities").query({ limit: "5000" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("ordena de forma determinística con tie-breaker capa, objectid", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/communities");
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/ORDER BY nombre, capa, objectid/);
  });
});

describe("GET /api/communities/stats", () => {
  it("llega al handler de stats y no cae en /:objectid", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ capa: "comunidades_campesinas", total: "1", con_geometria: "1", area_total_km2: "10" }],
    });

    const res = await request(createApp()).get("/api/communities/stats");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/GROUP BY capa/);
  });
});

describe("GET /api/communities/intersect", () => {
  it("llega al handler de intersect y no cae en /:objectid", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/communities/intersect").query({
      geometry: JSON.stringify({ type: "Point", coordinates: [0, 0] }),
    });

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toMatch(/ST_Intersects/);
    expect(queryMock.mock.calls[0][0]).toMatch(/ORDER BY nombre, capa, objectid/);
  });

  it("devuelve 400 sin el parámetro geometry", async () => {
    const res = await request(createApp()).get("/api/communities/intersect");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con geometry que no es JSON válido", async () => {
    const res = await request(createApp()).get("/api/communities/intersect").query({ geometry: "no-es-json" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con geometry JSON válido pero sin forma de geometría GeoJSON", async () => {
    const res = await request(createApp())
      .get("/api/communities/intersect")
      .query({ geometry: JSON.stringify({ foo: "bar" }) });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/communities/:objectid", () => {
  it("devuelve la comunidad cuando objectid + capa existen", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ objectid: 42, capa: "comunidades_campesinas", nombre: "Comunidad Test" }] });

    const res = await request(createApp())
      .get("/api/communities/42")
      .query({ capa: "comunidades_campesinas" });

    expect(res.status).toBe(200);
    expect(res.body.objectid).toBe(42);
    expect(queryMock.mock.calls[0][1]).toEqual([42, "comunidades_campesinas"]);
  });

  it("devuelve 400 sin el parámetro capa (objectid por sí solo no es clave única)", async () => {
    const res = await request(createApp()).get("/api/communities/42");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con capa inválida", async () => {
    const res = await request(createApp()).get("/api/communities/42").query({ capa: "no-existe" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con objectid no numérico", async () => {
    const res = await request(createApp())
      .get("/api/communities/abc")
      .query({ capa: "comunidades_campesinas" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando la combinación objectid+capa no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp())
      .get("/api/communities/999999")
      .query({ capa: "comunidades_nativas" });
    expect(res.status).toBe(404);
  });
});
