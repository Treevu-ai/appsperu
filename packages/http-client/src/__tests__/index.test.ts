import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, HttpRequestError } from "../index.js";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the raw Response on success", async () => {
    const response = new Response("ok", { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchWithTimeout("https://example.test/api");

    expect(result).toBe(response);
  });

  it("passes through init (headers, method) to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://example.test/api", { headers: { "User-Agent": "test-agent" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ "User-Agent": "test-agent" });
  });

  it("throws a timeout error when the request is aborted", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      })
    );

    const pending = fetchWithTimeout("https://example.test/slow", {}, 1_000);
    const assertion = expect(pending).rejects.toThrow(/Timeout al consultar API/);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("propagates a non-abort network error unchanged", async () => {
    const networkError = new Error("ECONNREFUSED");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(fetchWithTimeout("https://example.test/api")).rejects.toBe(networkError);
  });
});

describe("HttpRequestError", () => {
  it("carries kind and optional status", () => {
    const error = new HttpRequestError("http", "La API respondió 500.", 500);

    expect(error.kind).toBe("http");
    expect(error.status).toBe(500);
    expect(error.name).toBe("HttpRequestError");
  });
});
