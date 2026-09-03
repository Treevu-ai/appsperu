/**
 * Archivo separado de search.test.ts porque mockea search-index.json con
 * datos reales — search.test.ts usa el placeholder vacío del repo para
 * probar el caso "sin corte todavía".
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/data/search-index.json", () => ({
  default: {
    corte: "2026-09-09T13:00:00.000Z",
    items: [
      { tipo: "ruc", identificador: "20131312955", descripcion: "CONSTRUCTORA DEMO SAC", fuente: "identidad-fiscal / contribuyentes" },
      { tipo: "obra", identificador: "OBRA-1", descripcion: "Mejoramiento de la avenida central", fuente: "infobras / public-works" },
    ],
  },
}));

const { onRequestGet } = await import("../api/search.js");

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
    env: { RATE_LIMIT: inMemoryKv() },
    params: {},
    waitUntil: () => {},
  };
}

describe("GET /api/search — hit real contra el índice bundleado", () => {
  it("encuentra por texto libre y marca corteUsado con la fecha del corte", async () => {
    const res = await onRequestGet(makeContext("avenida central"));
    const body = (await res.json()) as {
      resultados: { tipo: string; identificador: string; descripcion: string }[];
      corteUsado: string | null;
    };
    expect(body.corteUsado).toBe("2026-09-09T13:00:00.000Z");
    expect(body.resultados).toContainEqual(
      expect.objectContaining({ tipo: "obra", identificador: "OBRA-1", descripcion: "Mejoramiento de la avenida central" }),
    );
  });

  it("encuentra por RUC exacto", async () => {
    const res = await onRequestGet(makeContext("20131312955"));
    const body = (await res.json()) as { resultados: { tipo: string; identificador: string }[] };
    expect(body.resultados).toContainEqual(expect.objectContaining({ tipo: "ruc", identificador: "20131312955" }));
  });
});
