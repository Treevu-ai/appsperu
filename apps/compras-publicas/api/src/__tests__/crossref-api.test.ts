import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const radarQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/radar-pool.js", () => ({
  radarPool: { query: radarQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  radarQueryMock.mockReset();
});

describe("GET /api/crossref", () => {
  it("returns an empty list without querying either source when the crosswalk is empty", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultados: [] });
    expect(radarQueryMock).not.toHaveBeenCalled();
  });

  it("merges the persisted crosswalk with live totals from both sources", async () => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [
          {
            mef_entity_code: "854",
            mef_nombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
            oece_buyer_id: "PE-CONSUCODE-1339",
            oece_buyer_name: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
            confidence: "confirmada",
            score: "1.000",
            computed_at: "2026-08-16T20:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ buyer_id: "PE-CONSUCODE-1339", procesos: "7", valor_total: "1234447" }],
      });
    radarQueryMock.mockResolvedValueOnce({ rows: [{ entity_code: "854", devengado: "30865325" }] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      mefEntityCode: "854",
      confidence: "confirmada",
      devengado: 30865325,
      comprasProcesos: 7,
      comprasValorTotal: 1234447,
    });
  });

  it("applies the confidence filter", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app).get("/api/crossref").query({ confidence: "candidata" });

    const [sql, params] = poolQueryMock.mock.calls[0];
    expect(sql).toMatch(/WHERE confidence = \$1/);
    expect(params).toEqual(["candidata"]);
  });
});
