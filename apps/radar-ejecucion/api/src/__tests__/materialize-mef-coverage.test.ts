import { describe, expect, it, vi, beforeEach } from "vitest";

const poolQueryMock = vi.fn();
const clientQueryMock = vi.fn();
const clientReleaseMock = vi.fn();
const poolConnectMock = vi.fn(() => Promise.resolve({ query: clientQueryMock, release: clientReleaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock, connect: poolConnectMock },
}));

const { materializeMefCoverage } = await import("../ingest/materialize-mef-coverage.js");

const SNAPSHOT_ROW = { n: 10, max_corte: "2026-08-01", batch_ids: [1] };
const EMPTY_ROW = { n: 0, max_corte: null, batch_ids: [] };

beforeEach(() => {
  poolQueryMock.mockReset();
  clientQueryMock.mockReset();
  clientReleaseMock.mockReset();
  clientQueryMock.mockResolvedValue({ rows: [] });
  // Orden real de las 3 queries SELECT dentro de materializeMefCoverage:
  // GR (buildSedeEjecutoraSnapshot), GL (buildSedeEjecutoraSnapshot), GN (buildMetaDepartamentoSnapshot).
  poolQueryMock
    .mockResolvedValueOnce({ rows: [SNAPSHOT_ROW] }) // GR
    .mockResolvedValueOnce({ rows: [EMPTY_ROW] }) // GL
    .mockResolvedValueOnce({ rows: [SNAPSHOT_ROW] }); // GN
});

describe("materializeMefCoverage", () => {
  it("inserta todas las filas de un departamento dentro de una sola transacción (hallazgo CodeRabbit PR #145)", async () => {
    await materializeMefCoverage(["LA LIBERTAD"]);

    expect(poolConnectMock).toHaveBeenCalledTimes(1);
    const calls = clientQueryMock.mock.calls.map((call) => call[0]);
    expect(calls[0]).toBe("BEGIN");
    expect(calls.at(-1)).toBe("COMMIT");
    // coverageRowsFromMefSnapshots emite una fila por fuente esperada (GR/GL/GN),
    // incluso cuando una viene vacía (BLOQUEADA) — las 3 deben insertarse dentro
    // de la misma transacción.
    const insertCalls = calls.filter((sql) => typeof sql === "string" && sql.includes("INSERT INTO territorial_coverage"));
    expect(insertCalls).toHaveLength(3);
    expect(clientReleaseMock).toHaveBeenCalledTimes(1);
  });

  it("hace ROLLBACK y relanza si un INSERT falla a mitad de la transacción", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // primer INSERT ok
      .mockRejectedValueOnce(new Error("boom")); // segundo INSERT falla

    await expect(materializeMefCoverage(["LA LIBERTAD"])).rejects.toThrow("boom");

    const calls = clientQueryMock.mock.calls.map((call) => call[0]);
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(clientReleaseMock).toHaveBeenCalledTimes(1);
  });
});
