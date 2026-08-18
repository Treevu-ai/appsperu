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

describe("GET /api/indicators", () => {
  it("returns the list with traceability and applies filters", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          indicator_code: "CUMP02",
          indicator_name: "Ejecución física del POI",
          serie_id: "gn",
          serie_label: "Gobierno nacional",
          nivel_gobierno: "GN",
          value: "76.60",
          measurement_date: "2024-01-01",
          unit_of_measure: "%",
          frequency: "anual",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/indicators").query({ indicatorCode: "cump02", nivelGobierno: "gn" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      indicatorCode: "CUMP02",
      nivelGobierno: "GN",
      value: 76.6,
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/ObservaPerú/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["CUMP02", "GN"]);
  });

  it("responde 400 cuando indicatorCode llega repetido como array", async () => {
    const app = createApp();
    const res = await request(app).get("/api/indicators?indicatorCode=a&indicatorCode=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
