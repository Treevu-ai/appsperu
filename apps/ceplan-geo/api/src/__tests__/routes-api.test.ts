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

  it("returns department territory summary for pilot departments", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ distritos: "83" }] })
      .mockResolvedValueOnce({
        rows: [
          { infra_type: "aeropuerto", total: "7" },
          { infra_type: "puerto", total: "1" },
        ],
      });

    const res = await request(createApp())
      .get("/api/territories/summary")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      departamento: "LA LIBERTAD",
      ubigeoPrefijo: "13",
      distritos: 83,
      infraestructura: { aeropuerto: 7, puerto: 1 },
      fuente: "ceplan-geo",
    });
  });

  it("rejects summary for non-pilot departments", async () => {
    const res = await request(createApp())
      .get("/api/territories/summary")
      .query({ departamento: "LIMA" });

    expect(res.status).toBe(400);
    expect(res.body.departamentosPermitidos).toContain("CUSCO");
  });
});
