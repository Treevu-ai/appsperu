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

describe("GET /api/meta/sources", () => {
  it("agrega los lotes y desgloses de VERTIX (APP/PA) y OxI, en ese orden", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 1, records_total: 340, checksum: "abc", fetched_at: "2026-08-28T02:19:00.548Z" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { tipo_proyecto: "APP", total: 226 },
          { tipo_proyecto: "PA", total: 114 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 1, records_total: 761, checksum: "def", fetched_at: "2026-08-28T02:19:00.548Z" }],
      })
      .mockResolvedValueOnce({
        rows: [{ fase: "Priorizado", total: 254 }],
      });

    const app = createApp();
    const res = await request(app).get("/api/meta/sources");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lotes: [{ id: 1, records_total: 340, checksum: "abc", fetched_at: "2026-08-28T02:19:00.548Z" }],
      desgloseTipo: [
        { tipo_proyecto: "APP", total: 226 },
        { tipo_proyecto: "PA", total: 114 },
      ],
      oxiLotes: [{ id: 1, records_total: 761, checksum: "def", fetched_at: "2026-08-28T02:19:00.548Z" }],
      oxiDesgloseFase: [{ fase: "Priorizado", total: 254 }],
    });
    expect(queryMock).toHaveBeenCalledTimes(4);
  });
});
