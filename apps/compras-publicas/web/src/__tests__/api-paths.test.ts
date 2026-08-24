import { afterEach, describe, expect, it, vi } from "vitest";
import { getMunicipality } from "../lib/api";
import { fetchJson } from "../../../../../packages/http-client/src";

afterEach(() => vi.unstubAllGlobals());

describe("dynamic API paths", () => {
  it("does not double-encode an already escaped municipality identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ resultados: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await getMunicipality("seace%3Aentity%3A1215");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/municipalities\/seace%3Aentity%3A1215$/);
  });

  it("reports a non-success HTTP response without pretending it is data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchJson("http://api", "/unavailable")).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
  });

  it("distinguishes an invalid JSON response from a successful API result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("not json"); } }));
    await expect(fetchJson("http://api", "/invalid")).rejects.toMatchObject({ kind: "invalid_json" });
  });

  it("cancels a request that exceeds its configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const result = fetchJson("http://api", "/slow", { timeout: 1 });
    const expectation = expect(result).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1);
    await expectation;
    vi.useRealTimers();
  });
});
