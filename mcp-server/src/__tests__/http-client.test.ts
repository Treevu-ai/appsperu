import { describe, expect, it, vi } from "vitest";
import { buildUrl, callApi } from "../http-client.js";
import { serializeToolResponse } from "../tool-output.js";

describe("MCP HTTP contract", () => {
  it("encodes query values and omits undefined", () => {
    expect(buildUrl("http://127.0.0.1:4001", "/api/contracts", { q: "aceite & filtro", empty: undefined }))
      .toBe("http://127.0.0.1:4001/api/contracts?q=aceite+%26+filtro");
  });

  it("returns non-JSON bodies without treating a domain 404 as infrastructure failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, headers: new Headers({ "content-type": "text/plain" }), text: async () => "no encontrado" }));
    await expect(callApi("http://127.0.0.1:4001/api/nope")).resolves.toEqual({ status: 404, body: "no encontrado" });
    vi.unstubAllGlobals();
  });

  it("cancels an unavailable API at the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const result = callApi("http://127.0.0.1:4001/api/slow", { timeoutMs: 1 });
    const expectation = expect(result).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks oversized output instead of silently cutting it", () => {
    const result = JSON.parse(serializeToolResponse(200, { text: "x".repeat(100_001) }));
    expect(result.truncated).toBe(true);
    expect(result.limitation).toMatch(/límite/i);
  });
});
