import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validateApiKeyMock = vi.fn();
vi.mock("../auth/api-key.js", () => ({ validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args) }));

import { resolveActiveKey } from "../index.js";

describe("resolveActiveKey (Fase 1 sk-rastro-...)", () => {
  const originalEnv = process.env.MCP_API_KEY;

  beforeEach(() => {
    validateApiKeyMock.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.MCP_API_KEY;
    else process.env.MCP_API_KEY = originalEnv;
  });

  it("returns null without ever touching validateApiKey when MCP_API_KEY is unset", async () => {
    delete process.env.MCP_API_KEY;
    const result = await resolveActiveKey();
    expect(result).toBeNull();
    expect(validateApiKeyMock).not.toHaveBeenCalled();
  });

  it("throws with a clear message when the key is invalid", async () => {
    process.env.MCP_API_KEY = "sk-rastro-invalido";
    validateApiKeyMock.mockResolvedValueOnce({ ok: false, reason: "EXPIRED" });
    await expect(resolveActiveKey()).rejects.toThrow(/venci/i);
  });

  it("returns the key record when valid", async () => {
    process.env.MCP_API_KEY = "sk-rastro-valido";
    const key = { id: 1, groupId: "taller-1", queryLimit: 100, queriesUsed: 3 };
    validateApiKeyMock.mockResolvedValueOnce({ ok: true, key });
    const result = await resolveActiveKey();
    expect(result).toEqual(key);
  });
});
