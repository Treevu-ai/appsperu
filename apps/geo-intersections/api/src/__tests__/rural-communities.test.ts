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
  });

  it("devuelve 400 sin el parámetro geometry", async () => {
    const res = await request(createApp()).get("/api/communities/intersect");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/communities/:objectid", () => {
  it("sigue funcionando para un objectid real", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ objectid: 42, nombre: "Comunidad Test" }] });

    const res = await request(createApp()).get("/api/communities/42");

    expect(res.status).toBe(200);
    expect(res.body.objectid).toBe(42);
  });
});
