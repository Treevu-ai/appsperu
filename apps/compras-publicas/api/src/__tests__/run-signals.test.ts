import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regresión de OE-01 (2026-09-10): `runMinorContractSignals` insertaba cada
 * señal y cada lote de evidencia con un `INSERT` propio, uno por `await`
 * dentro del loop — impráctico a escala Lima/nacional (miles de señales).
 * Este test no verifica performance real (necesitaría una base real y miles
 * de filas); verifica el contrato que hace la optimización posible sin
 * romper nada: las señales generadas para un mismo insumo no cambian, y se
 * insertan en un número de queries proporcional a los LOTES, no a la
 * cantidad de señales.
 */

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { runMinorContractSignals } = await import("../minor-contracts/run-signals.js");

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    contracting_id: "c-1",
    source_contracting_id: "source-c-1",
    municipality_id: "m-1",
    winning_supplier_id: "s-1",
    object_normalized: "mantenimiento camioneta toyota hilux",
    awarded_amount: "43500",
    publication_date: "2026-02-01T08:00:00-05:00",
    quotation_end_date: "2026-02-01T12:00:00-05:00",
    quotation_count: 1,
    valid_quotation_count: null,
    evidence_found: 3,
    evidence_expected: 4,
    source_batch_id: "batch-1",
    source_url: "https://example.gob.pe/proceso/1",
    source_timestamp: "2026-02-01T08:00:00-05:00",
    semantic_embedding: null,
    semantic_provider: null,
    semantic_model: null,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: vi.fn() });
});

describe("runMinorContractSignals — inserción por lotes", () => {
  it("inserta todas las señales de una corrida en una sola query, no una por señal", async () => {
    const rows = [
      sourceRow(),
      sourceRow({
        contracting_id: "c-2",
        source_contracting_id: "source-c-2",
        publication_date: "2026-02-15T08:00:00-05:00",
        quotation_end_date: "2026-02-15T12:00:00-05:00",
        awarded_amount: "20000",
      }),
    ];

    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows }) // SELECT de contratos
      .mockResolvedValueOnce(undefined); // INSERT INTO signal_runs

    // A partir de aquí: N lotes de contract_signals + M lotes de contract_evidence + COMMIT.
    queryMock.mockResolvedValue(undefined);

    const summary = await runMinorContractSignals({ department: "LA LIBERTAD", year: 2026 });

    expect(summary.contractsConsidered).toBe(2);
    expect(summary.signalsCreated).toBeGreaterThan(0);

    const calls = queryMock.mock.calls;
    const signalInsertCalls = calls.filter(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO contract_signals"));
    const evidenceInsertCalls = calls.filter(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO contract_evidence"));

    // Con menos de 500 señales, todo el lote entra en una sola query — el
    // punto central de esta regresión: antes había una query por señal.
    expect(signalInsertCalls.length).toBe(1);

    const [, params] = signalInsertCalls[0];
    const insertedSignals = JSON.parse(params[0]);
    expect(insertedSignals.length).toBe(summary.signalsCreated);
    expect(insertedSignals.every((row: { signal_run_id: string }) => row.signal_run_id === summary.signalRunId)).toBe(true);

    // La evidencia de todos los lotes de señales también va en una sola
    // query si cabe en el tamaño de lote — mismo criterio.
    expect(evidenceInsertCalls.length).toBeLessThanOrEqual(1);

    expect(queryMock).toHaveBeenCalledWith("BEGIN");
    expect(queryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("no cambia qué señales se generan respecto a la lógica ya probada de deriveSignals", async () => {
    const rows = [sourceRow()];
    queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce(undefined);
    queryMock.mockResolvedValue(undefined);

    const summary = await runMinorContractSignals({ department: "LA LIBERTAD", year: 2026 });

    const signalInsertCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO contract_signals")
    );
    const insertedSignals = JSON.parse(signalInsertCall![1][0]) as Array<{ signal_type: string }>;
    const signalTypes = new Set(insertedSignals.map((row) => row.signal_type));

    // Mismo contrato que el fixture base de minor-contract-signals.test.ts:
    // monto a 98% del límite (S05) y cobertura de evidencia (S09) deben seguir
    // apareciendo — si esto falla, el cambio de inserción alteró qué se calcula,
    // no solo cómo se persiste.
    expect(signalTypes.has("S05")).toBe(true);
    expect(signalTypes.has("S09")).toBe(true);
    expect(summary.signalsCreated).toBe(insertedSignals.length);
  });

  it("hace ROLLBACK y no deja señales parciales si una query falla a mitad de la corrida", async () => {
    const rows = [sourceRow()];
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows }) // SELECT
      .mockRejectedValueOnce(new Error("boom")); // INSERT INTO signal_runs falla

    await expect(runMinorContractSignals({ department: "LA LIBERTAD", year: 2026 })).rejects.toThrow("boom");
    expect(queryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(queryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO contract_signals"))).toBe(false);
  });
});
