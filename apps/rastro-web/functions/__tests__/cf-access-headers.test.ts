/**
 * Test de la protección con Cloudflare Access (ver docs/API_ACCESS_PROTECTION.md).
 *
 * Lo que se valida:
 * - Si los 2 secrets están configurados en env, la Function envía los
 *   headers `CF-Access-Client-Id` y `CF-Access-Client-Secret` en cada
 *   request a las 3 APIs de origen.
 * - Si los secrets están ausentes, NO se envían esos headers (la Function
 *   sigue funcionando contra localhost sin Access en el camino).
 * - Si solo uno de los 2 secrets está configurado, tampoco se envían
 *   (protección contra config a medias — no leakear un Client-Id solo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_FETCH = globalThis.fetch;

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

/** Mockea `global.fetch` para que las 3 fuentes devuelvan un 200 con shape
 *  válido para la Function, y deja registrado el último `init.headers` de
 *  cada llamada para inspección en el test. */
function mockFetchWithRecorder(): { lastHeaders: Record<string, string>[] } {
  const state: { lastHeaders: Record<string, string>[] } = { lastHeaders: [] };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    state.lastHeaders.push(headers);

    // Shape mínimo válido para cada fuente
    let body: unknown;
    if (url.includes("/contribuyentes")) {
      body = { ruc: "20131312955", razonSocial: "DEMO SAC" };
    } else if (url.includes("/investments")) {
      body = { resultados: [] };
    } else if (url.includes("/public-works")) {
      body = { resultados: [] };
    } else {
      body = {};
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return state;
}

function makeContext(q: string, env: Partial<PagesEnv> & Record<string, string> = {}): PagesEventContext {
  return {
    request: new Request(`https://rastro.fyi/api/search?q=${encodeURIComponent(q)}`),
    env: { RATE_LIMIT: inMemoryKv(), ...env } as PagesEnv,
    params: {},
    waitUntil: () => {},
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});

describe("GET /api/search — Cloudflare Access (Service Token) headers", () => {
  it("envía CF-Access-Client-Id y CF-Access-Client-Secret cuando ambos secrets están configurados", async () => {
    const recorder = mockFetchWithRecorder();
    const { onRequestGet } = await import("../api/search.js");
    const ctx = makeContext("demo", {
      VITE_API_BASE_URL_IDENTIDAD_FISCAL: "https://api.rastro.pe/identidad-fiscal",
      VITE_API_BASE_URL_RADAR_INVERSIONES: "https://api.rastro.pe/radar-inversiones",
      VITE_API_BASE_URL_INFOBRAS: "https://api.rastro.pe/infobras",
      CF_ACCESS_CLIENT_ID: "test-client-id-abc.access",
      CF_ACCESS_CLIENT_SECRET: "test-client-secret-xyz",
    }) as unknown as PagesEventContext;
    // El handler está tipado como PagesFunctionHandler con el PagesEnv
    // declarado en types.d.ts; este cast es seguro porque solo leemos
    // los campos que el código realmente inspecciona.
    await onRequestGet(ctx as unknown as Parameters<typeof onRequestGet>[0]);

    expect(recorder.lastHeaders.length).toBeGreaterThanOrEqual(3);
    for (const headers of recorder.lastHeaders) {
      expect(headers["CF-Access-Client-Id"]).toBe("test-client-id-abc.access");
      expect(headers["CF-Access-Client-Secret"]).toBe("test-client-secret-xyz");
      expect(headers["Accept"]).toBe("application/json");
    }
  });

  it("NO envía los headers cuando los 2 secrets están ausentes (dev local contra localhost)", async () => {
    const recorder = mockFetchWithRecorder();
    const { onRequestGet } = await import("../api/search.js");
    const ctx = makeContext("demo", {
      VITE_API_BASE_URL_IDENTIDAD_FISCAL: "http://localhost:4006",
      VITE_API_BASE_URL_RADAR_INVERSIONES: "http://localhost:4002",
      VITE_API_BASE_URL_INFOBRAS: "http://localhost:4003",
    }) as unknown as PagesEventContext;
    await onRequestGet(ctx as unknown as Parameters<typeof onRequestGet>[0]);

    expect(recorder.lastHeaders.length).toBeGreaterThanOrEqual(3);
    for (const headers of recorder.lastHeaders) {
      expect(headers["CF-Access-Client-Id"]).toBeUndefined();
      expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
      expect(headers["Accept"]).toBe("application/json");
    }
  });

  it("NO envía los headers si solo uno de los 2 secrets está configurado (config a medias)", async () => {
    const recorder = mockFetchWithRecorder();
    const { onRequestGet } = await import("../api/search.js");
    const ctx = makeContext("demo", {
      VITE_API_BASE_URL_IDENTIDAD_FISCAL: "https://api.rastro.pe/identidad-fiscal",
      CF_ACCESS_CLIENT_ID: "test-client-id-only.access",
      // CF_ACCESS_CLIENT_SECRET omitido a propósito
    }) as unknown as PagesEventContext;
    await onRequestGet(ctx as unknown as Parameters<typeof onRequestGet>[0]);

    expect(recorder.lastHeaders.length).toBeGreaterThan(0);
    for (const headers of recorder.lastHeaders) {
      expect(headers["CF-Access-Client-Id"]).toBeUndefined();
      expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
    }
  });

  it("NO envía los headers ni la request si baseUrl no es exactamente https://api.rastro.pe, aunque los secrets estén configurados", async () => {
    const recorder = mockFetchWithRecorder();
    const { onRequestGet } = await import("../api/search.js");
    const ctx = makeContext("demo", {
      // Origin parecido pero no exacto — typo o config a medias.
      VITE_API_BASE_URL_IDENTIDAD_FISCAL: "https://api.rastro.pe.evil.example/identidad-fiscal",
      CF_ACCESS_CLIENT_ID: "test-client-id-abc.access",
      CF_ACCESS_CLIENT_SECRET: "test-client-secret-xyz",
    }) as unknown as PagesEventContext;
    const res = await onRequestGet(ctx as unknown as Parameters<typeof onRequestGet>[0]);

    // fetchWithTimeout tira antes de llamar a fetch() para ese origin —
    // ninguna llamada a esa fuente debió registrar headers con el secret.
    for (const headers of recorder.lastHeaders) {
      expect(headers["CF-Access-Client-Id"]).toBeUndefined();
      expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
    }
    // La búsqueda igual responde (cae al índice bundleado para esa fuente).
    expect(res.status).toBe(200);
  });
});
