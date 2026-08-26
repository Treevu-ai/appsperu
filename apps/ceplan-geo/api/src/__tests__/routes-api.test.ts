import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("read routes", () => {
  it("lists layers", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "layer-1",
          layer_name: "geoceplan:cb_limdistx",
          layer_title: "cb_limdistx",
          workspace: "geoceplan",
          service_type: "WFS",
          geometry_type: "Geometry",
          extent_minx: null,
          extent_miny: null,
          extent_maxx: null,
          extent_maxy: null,
          feature_count: 1874,
          last_ingested_at: "2026-08-26T00:00:00.000Z",
        },
      ],
    });

    const res = await request(createApp()).get("/api/layers");
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].layerName).toBe("geoceplan:cb_limdistx");
  });

  it("rejects duplicate query params on territories bbox", async () => {
    const res = await request(createApp()).get("/api/territories/bbox?minx=1&minx=2&miny=1&maxx=2&maxy=2");
    expect(res.status).toBe(400);
  });

  it("returns infrastructure near a ubigeo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          infra_type: "puerto",
          name: "SALAVERRY",
          distance_km: "12.5",
          properties: {},
        },
      ],
    });

    const res = await request(createApp())
      .get("/api/infrastructure/near")
      .query({ ubigeo: "130101", radius_km: 50 });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].name).toBe("SALAVERRY");
  });
});
