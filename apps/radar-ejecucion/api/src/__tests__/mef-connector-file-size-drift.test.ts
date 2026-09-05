import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CX-02 (docs/adr/0015-mef-connector-offsets-manuales-decision.md): estas
// pruebas cubren el chequeo de deriva de tamaño de archivo, sin tocar base
// de datos — mef-connector.ts importa el pool a nivel de módulo, así que se
// mockea para poder importar el archivo en un test unitario puro.
vi.mock("../db/pool.js", () => ({ pool: {} }));
vi.mock("../db/budget-coverage.js", () => ({ refreshBudgetCoverageSnapshots: vi.fn() }));

import { assertMefFileSizeWithinTolerance, fetchMefFileTotalBytes } from "../ingest/mef-connector.js";

function mockRangeFetch(totalBytes: number, opts: { ok?: boolean; status?: number; withHeader?: boolean } = {}) {
  const { ok = true, status = 206, withHeader = true } = opts;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (name: string) => (name === "content-range" && withHeader ? `bytes 0-0/${totalBytes}` : null) },
    text: () => Promise.resolve(""),
  });
}

describe("fetchMefFileTotalBytes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses the total size from Content-Range", async () => {
    global.fetch = mockRangeFetch(6_240_885_549) as unknown as typeof fetch;
    await expect(fetchMefFileTotalBytes("2026-Gasto-Mensual.csv")).resolves.toBe(6_240_885_549);
  });

  it("throws after retrying when the MEF server never returns a usable Content-Range", async () => {
    global.fetch = mockRangeFetch(0, { withHeader: false }) as unknown as typeof fetch;
    await expect(fetchMefFileTotalBytes("2026-Gasto-Mensual.csv", 1)).rejects.toThrow(/Content-Range/);
  });

  it("throws after retrying on a non-2xx/206 response", async () => {
    global.fetch = mockRangeFetch(0, { ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(fetchMefFileTotalBytes("2026-Gasto-Mensual.csv", 1)).rejects.toThrow(/500/);
  });
});

describe("assertMefFileSizeWithinTolerance", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.MEF_ALLOW_SIZE_DRIFT;

  beforeEach(() => {
    delete process.env.MEF_ALLOW_SIZE_DRIFT;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.MEF_ALLOW_SIZE_DRIFT;
    else process.env.MEF_ALLOW_SIZE_DRIFT = originalEnv;
    vi.restoreAllMocks();
  });

  it("resolves silently when the observed size matches the expected size", async () => {
    global.fetch = mockRangeFetch(6_240_885_549) as unknown as typeof fetch;
    await expect(
      assertMefFileSizeWithinTolerance("2026-Gasto-Mensual.csv", 6_240_885_549)
    ).resolves.toBe(6_240_885_549);
  });

  it("resolves within the 2% tolerance without throwing", async () => {
    const expected = 6_240_885_549;
    const observed = Math.round(expected * 1.01); // 1% de deriva, dentro de tolerancia
    global.fetch = mockRangeFetch(observed) as unknown as typeof fetch;
    await expect(assertMefFileSizeWithinTolerance("2026-Gasto-Mensual.csv", expected)).resolves.toBe(observed);
  });

  it("throws when the drift exceeds 2% and MEF_ALLOW_SIZE_DRIFT is not set", async () => {
    const expected = 6_240_885_549;
    const observed = Math.round(expected * 1.5); // 50% de deriva — archivo drásticamente distinto
    global.fetch = mockRangeFetch(observed) as unknown as typeof fetch;
    await expect(assertMefFileSizeWithinTolerance("2026-Gasto-Mensual.csv", expected)).rejects.toThrow(
      /offsets manuales/
    );
  });

  it("degrades to a warning instead of throwing when MEF_ALLOW_SIZE_DRIFT=true", async () => {
    process.env.MEF_ALLOW_SIZE_DRIFT = "true";
    const expected = 6_240_885_549;
    const observed = Math.round(expected * 1.5);
    global.fetch = mockRangeFetch(observed) as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(assertMefFileSizeWithinTolerance("2026-Gasto-Mensual.csv", expected)).resolves.toBe(observed);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
