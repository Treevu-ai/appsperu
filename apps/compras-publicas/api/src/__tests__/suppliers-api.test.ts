import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/radar-pool.js", () => ({
  radarPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/suppliers", () => {
  it("returns aggregated suppliers with a concentration block", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { supplier_id: "PE-RUC-1", supplier_name: "PROVEEDOR A", adjudicaciones: "3", entidades_distintas: "2", valor_total: "900000" },
        { supplier_id: "PE-RUC-2", supplier_name: "PROVEEDOR B", adjudicaciones: "1", entidades_distintas: "1", valor_total: "100000" },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/suppliers");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(2);
    expect(res.body.resultados[0]).toMatchObject({ supplierId: "PE-RUC-1", valorTotal: 900000 });
    expect(res.body.concentracion.cr3).toBe(100);
    expect(res.body.concentracion.hhi).toBeGreaterThan(0);
  });

  it("applies the departamento filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app).get("/api/suppliers").query({ departamento: "LA LIBERTAD" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/WHERE departamento = \$1/);
    expect(params).toEqual(["LA LIBERTAD"]);
  });
});

describe("GET /api/suppliers/:supplierId", () => {
  it("returns 404 when the supplier was not ingested", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/suppliers/nope");

    expect(res.status).toBe(404);
  });

  it("returns the supplier profile with all its adjudicaciones", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ocid: "ocds-1",
          award_id: "999999-1",
          buyer_id: "PE-CONSUCODE-1339",
          buyer_name: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
          departamento: "LA LIBERTAD",
          supplier_id: "PE-RUC-1",
          supplier_name: "PROVEEDOR A",
          valor_monto: "89950",
          valor_moneda: "PEN",
          fecha: "2024-04-01",
          fetched_at: "2026-08-17T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/suppliers/PE-RUC-1");

    expect(res.status).toBe(200);
    expect(res.body.supplierName).toBe("PROVEEDOR A");
    expect(res.body.adjudicaciones[0]).toMatchObject({ ocid: "ocds-1", valorMonto: 89950 });
  });
});
