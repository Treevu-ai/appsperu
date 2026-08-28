import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/meta/sources", () => {
  it("agrega los lotes ingeridos y el desglose por anexo", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 1, report_period: "2026-01", file_name: "sintesis-la-libertad-01-2026.pdf", checksum: "abc", ingested_at: "2026-08-28T15:00:00.000Z" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { anexo_numero: 1, total: 13 },
          { anexo_numero: 10, total: 325 },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/meta/sources");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lotes: [{ id: 1, report_period: "2026-01", file_name: "sintesis-la-libertad-01-2026.pdf", checksum: "abc", ingested_at: "2026-08-28T15:00:00.000Z" }],
      desgloseAnexo: [
        { anexo_numero: 1, total: 13 },
        { anexo_numero: 10, total: 325 },
      ],
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
