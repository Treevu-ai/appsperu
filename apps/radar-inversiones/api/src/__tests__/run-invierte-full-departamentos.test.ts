import { describe, expect, it, afterEach, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../db/ejecucion-pool.js", () => ({ ejecucionPool: { query: vi.fn() } }));

const { resolveInvierteDepartamentosFromEnv } = await import("../ingest/run-invierte-full.js");
const {
  resolveInvierteDepartamentosFromEnv: resolveDesactivadas,
} = await import("../ingest/run-invierte-desactivadas-full.js");

describe("resolveInvierteDepartamentosFromEnv (run-invierte-full / run-invierte-desactivadas-full)", () => {
  const ENV_KEY = "INVIERTE_DEPARTAMENTOS";
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("sin la variable, usa DEFAULT_TERRITORIAL_SCOPE", () => {
    delete process.env[ENV_KEY];
    expect(resolveInvierteDepartamentosFromEnv()).toEqual(["LA LIBERTAD"]);
    expect(resolveDesactivadas()).toEqual(["LA LIBERTAD"]);
  });

  it("parsea una lista real separada por comas", () => {
    process.env[ENV_KEY] = "LA LIBERTAD, AREQUIPA,LIMA";
    expect(resolveInvierteDepartamentosFromEnv()).toEqual(["LA LIBERTAD", "AREQUIPA", "LIMA"]);
  });

  it("cae a DEFAULT_TERRITORIAL_SCOPE si la normalización deja lista vacía (hallazgo CodeRabbit PR #145)", () => {
    process.env[ENV_KEY] = ", ,";
    expect(resolveInvierteDepartamentosFromEnv()).toEqual(["LA LIBERTAD"]);
    expect(resolveDesactivadas()).toEqual(["LA LIBERTAD"]);
  });
});
