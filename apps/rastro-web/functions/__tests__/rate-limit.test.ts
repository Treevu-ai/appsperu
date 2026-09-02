import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIp, count429Last24h, currentWindowStart, recordRateLimitExceeded } from "../lib/rate-limit.js";

function inMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("checkRateLimit", () => {
  it("allows requests under the limit and decrements remaining", async () => {
    const kv = inMemoryKv();
    const now = Date.now();
    const first = await checkRateLimit(kv, "search", "1.2.3.4", 3, now);
    expect(first).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfterSeconds: expect.any(Number) });
    const second = await checkRateLimit(kv, "search", "1.2.3.4", 3, now);
    expect(second.remaining).toBe(1);
    const third = await checkRateLimit(kv, "search", "1.2.3.4", 3, now);
    expect(third.remaining).toBe(0);
  });

  it("blocks once the limit is reached in the same window", async () => {
    const kv = inMemoryKv();
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(kv, "search", "1.2.3.4", 3, now);
    const blocked = await checkRateLimit(kv, "search", "1.2.3.4", 3, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate IPs independently", async () => {
    const kv = inMemoryKv();
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(kv, "search", "1.1.1.1", 3, now);
    const otherIp = await checkRateLimit(kv, "search", "2.2.2.2", 3, now);
    expect(otherIp.allowed).toBe(true);
  });

  it("tracks separate routes independently for the same IP", async () => {
    const kv = inMemoryKv();
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(kv, "search", "1.1.1.1", 3, now);
    const otherRoute = await checkRateLimit(kv, "proveedor", "1.1.1.1", 3, now);
    expect(otherRoute.allowed).toBe(true);
  });

  it("resets the count in a new window", async () => {
    const kv = inMemoryKv();
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(kv, "search", "1.1.1.1", 3, now);
    const nextWindow = now + 61_000;
    const result = await checkRateLimit(kv, "search", "1.1.1.1", 3, nextWindow);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});

describe("currentWindowStart", () => {
  it("groups timestamps within the same minute into the same window", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    expect(currentWindowStart(base)).toBe(currentWindowStart(base + 30_000));
    expect(currentWindowStart(base)).not.toBe(currentWindowStart(base + 61_000));
  });
});

describe("count429Last24h", () => {
  it("sums hourly buckets recorded within the last 24h", async () => {
    const kv = inMemoryKv();
    const now = Date.parse("2026-01-02T10:30:00.000Z");
    await recordRateLimitExceeded(kv, now);
    await recordRateLimitExceeded(kv, now);
    await recordRateLimitExceeded(kv, now - 5 * 60 * 60 * 1000);
    const total = await count429Last24h(kv, now);
    expect(total).toBe(3);
  });

  it("does not count buckets older than 24h", async () => {
    const kv = inMemoryKv();
    const now = Date.parse("2026-01-02T10:30:00.000Z");
    await recordRateLimitExceeded(kv, now - 25 * 60 * 60 * 1000);
    const total = await count429Last24h(kv, now);
    expect(total).toBe(0);
  });

  it("returns 0 when nothing was ever recorded", async () => {
    const kv = inMemoryKv();
    const total = await count429Last24h(kv, Date.now());
    expect(total).toBe(0);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://example.test", {
      headers: { "CF-Connecting-IP": "9.9.9.9", "X-Forwarded-For": "8.8.8.8" },
    });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to X-Forwarded-For", () => {
    const req = new Request("https://example.test", { headers: { "X-Forwarded-For": "8.8.8.8" } });
    expect(clientIp(req)).toBe("8.8.8.8");
  });

  it("falls back to 'unknown' with no headers", () => {
    const req = new Request("https://example.test");
    expect(clientIp(req)).toBe("unknown");
  });
});
