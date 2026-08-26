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

describe("ceplan-geo api", () => {
  it("responds on /health", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("responds ready when database is reachable", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const app = createApp();
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("ok");
  });

  it("responds not ready when database fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));
    const app = createApp();
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.database).toBe("unavailable");
  });
});
