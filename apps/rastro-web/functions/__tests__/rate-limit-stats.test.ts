/**
 * Test de /api/rate-limit-stats: valida que expone el conteo de 429s de las
 * últimas 24h, y que el endpoint público está protegido con su propio rate
 * limit — sin esto, cada hit dispara 24 lecturas de KV (count429Last24h)
 * sin ningún costo para quien lo dispara.
 */
import { describe, expect, it } from "vitest";

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

function makeContext(kv: KVNamespace, ip = "203.0.113.10"): PagesEventContext {
  return {
    request: new Request("https://rastro.fyi/api/rate-limit-stats", { headers: { "CF-Connecting-IP": ip } }),
    env: { RATE_LIMIT: kv } as PagesEnv,
    params: {},
    waitUntil: () => {},
  };
}

describe("GET /api/rate-limit-stats", () => {
  it("devuelve count429Last24h en una solicitud normal", async () => {
    const { onRequestGet } = await import("../api/rate-limit-stats.js");
    const res = await onRequestGet(makeContext(inMemoryKv()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count429Last24h: number };
    expect(body.count429Last24h).toBe(0);
  });

  it("devuelve 429 al exceder su propio límite por IP", async () => {
    const { onRequestGet } = await import("../api/rate-limit-stats.js");
    const kv = inMemoryKv();
    let last: Response | null = null;
    for (let i = 0; i < 25; i += 1) {
      last = await onRequestGet(makeContext(kv, "203.0.113.20"));
    }
    expect(last?.status).toBe(429);
  });

  it("no comparte cupo entre IPs distintas", async () => {
    const { onRequestGet } = await import("../api/rate-limit-stats.js");
    const kv = inMemoryKv();
    for (let i = 0; i < 20; i += 1) {
      await onRequestGet(makeContext(kv, "203.0.113.30"));
    }
    const res = await onRequestGet(makeContext(kv, "203.0.113.40"));
    expect(res.status).toBe(200);
  });
});
