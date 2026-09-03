import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/search.js";

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

function makeContext(q: string): PagesEventContext {
  return {
    request: new Request(`https://rastro.fyi/api/search?q=${encodeURIComponent(q)}`),
    // Sin VITE_API_BASE_URL_* — simula las 3 fuentes en vivo no configuradas
    // (mismo estado que producción hoy, sin APIs publicadas).
    env: { RATE_LIMIT: inMemoryKv() },
    params: {},
    waitUntil: () => {},
  };
}

describe("GET /api/search — fallback al corte semanal (search-index.json)", () => {
  it("cuando las 3 fuentes en vivo no están configuradas, busca en el índice bundleado", async () => {
    const res = await onRequestGet(makeContext("cualquier texto"));
    const body = (await res.json()) as { fuentesNoDisponibles: string[]; corteUsado: string | null };
    // El índice bundleado en el repo es el placeholder vacío en dev/test —
    // lo importante es que NO se reporte como "no disponible" (usedIndex
    // cubre esa fuente) y que corteUsado quede en null (placeholder sin corte).
    expect(body.fuentesNoDisponibles).toEqual([]);
    expect(body.corteUsado).toBeNull();
  });

  it("rechaza queries de menos de 3 caracteres", async () => {
    const res = await onRequestGet(makeContext("ab"));
    expect(res.status).toBe(400);
  });
});
