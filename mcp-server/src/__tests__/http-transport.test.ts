import { describe, expect, it, vi, beforeEach } from "vitest";
import supertest from "supertest";

const validateApiKeyMock = vi.fn();
vi.mock("../auth/api-key.js", () => ({ validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args) }));

// buildMcpServer no se ejercita en estos tests (no llegamos a un initialize
// request válido) — se mockea solo para que la importación no arrastre el
// registro completo de tools/rate-limiter si algún día se ejercita.
vi.mock("../index.js", () => ({ buildMcpServer: vi.fn() }));

import { createHttpApp } from "../http-transport.js";

describe("HTTP transport (Fase 1-D)", () => {
  beforeEach(() => validateApiKeyMock.mockReset());

  it("GET /health responde ok sin necesitar x-api-key", async () => {
    const app = createHttpApp();
    const res = await supertest(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("POST /mcp sin header x-api-key devuelve 401", async () => {
    const app = createHttpApp();
    const res = await supertest(app).post("/mcp").send({ jsonrpc: "2.0", method: "initialize", id: 1 });
    expect(res.status).toBe(401);
    expect(validateApiKeyMock).not.toHaveBeenCalled();
  });

  it("POST /mcp con x-api-key inválida devuelve 401 sin llegar a crear sesión", async () => {
    validateApiKeyMock.mockResolvedValueOnce({ ok: false, reason: "NOT_FOUND" });
    const app = createHttpApp();
    const res = await supertest(app)
      .post("/mcp")
      .set("x-api-key", "sk-rastro-noexiste")
      .send({ jsonrpc: "2.0", method: "initialize", id: 1 });
    expect(res.status).toBe(401);
  });

  it("GET /mcp sin mcp-session-id devuelve 400 (con key válida)", async () => {
    validateApiKeyMock.mockResolvedValueOnce({ ok: true, key: { id: 1, groupId: "taller-1" } });
    const app = createHttpApp();
    const res = await supertest(app).get("/mcp").set("x-api-key", "sk-rastro-valida");
    expect(res.status).toBe(400);
  });
});
