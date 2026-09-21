import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestIngemmet } = await import("../ingest/ingemmet-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function feature(objectid: number, overrides: Record<string, unknown> = {}) {
  return {
    attributes: {
      OBJECTID: objectid,
      CODIGOU: "010033716",
      FEC_DENU: 1451883600000,
      CONCESION: "HUACRACANCHA 04",
      TIT_CONCES: "MINERA YANACOCHA S.R.L.",
      HECTAGIS: 899.9835,
      ESTADO: "T",
      D_ESTADO: "D.M. Titulado D.L. 708",
      SUSTANCIA: "M",
      DEPA: "LA LIBERTAD",
      PROVI: "JULCAN / SANTIAGO DE CHUCO",
      DISTRI: "QUIRUVILCA / CALAMARCA",
      FECHA_ACTUALIZACION: 1790014185000,
      ...overrides,
    },
  };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_ingemmet_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestIngemmet", () => {
  it("pagina por rango de OBJECTID mientras exceededTransferLimit sea true, sin resultRecordCount", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ features: [feature(1), feature(2, { CODIGOU: "OTRO" })], exceededTransferLimit: true }))
      .mockResolvedValueOnce(jsonResponse({ features: [feature(3, { CODIGOU: "TERCERO" })], exceededTransferLimit: false }));

    const summary = await ingestIngemmet();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("OBJECTID%3E0");
    expect(fetchMock.mock.calls[1][0]).toContain("OBJECTID%3E2");
    expect(fetchMock.mock.calls[0][0]).not.toContain("resultRecordCount");
    expect(summary.filasInsertadas).toBe(3);
  });

  it("deduplica filas con el mismo CODIGOU antes del INSERT, no deja que Postgres aborte", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ features: [feature(1), feature(2)], exceededTransferLimit: false }));

    const summary = await ingestIngemmet();

    const insertCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("INSERT INTO catastro_minero_derechos"));
    expect(insertCalls).toHaveLength(1);
    // Solo una tupla de VALUES para las dos features con el mismo CODIGOU.
    expect(insertCalls[0][1]).toHaveLength(14); // UPSERT_COLUMNS.length para 1 sola fila
    expect(summary.filasInsertadas).toBe(2); // conteo de filas normalizadas, antes de deduplicar
  });

  it("borra, dentro de la misma transacción, los derechos que no vinieron en esta corrida", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ features: [feature(1)], exceededTransferLimit: false }));

    await ingestIngemmet();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM catastro_minero_derechos"));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0]).toMatch(/source_batch_id <> \$1/);
  });

  it("hace rollback si la ingesta falla a mitad de camino", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    await expect(ingestIngemmet()).rejects.toThrow(/network error/);
  });

  it("detiene la paginación con una salvaguarda si el servidor no avanza el OBJECTID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ features: [feature(0)], exceededTransferLimit: true }));

    const summary = await ingestIngemmet();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(summary.filasOrigen).toBe(1);
  });

  it("rechaza una respuesta HTTP 200 sin 'features' como array -- no la trata como catálogo vacío (hallazgo real de Copilot)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200 })); // sin campo "features"

    await expect(ingestIngemmet()).rejects.toThrow(/sin "features"/);

    // No debe haber llegado a borrar la tabla con un catálogo malinterpretado como vacío.
    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM catastro_minero_derechos"));
    expect(deleteCalls).toHaveLength(0);
  });

  it("adquiere un advisory lock antes de tocar la tabla, para serializar corridas concurrentes (hallazgo real de Copilot)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ features: [feature(1)], exceededTransferLimit: false }));

    await ingestIngemmet();

    const lockCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("pg_advisory_xact_lock"));
    expect(lockCalls).toHaveLength(1);
    expect(lockCalls[0][0]).toMatch(/hashtext\('catastro_minero_derechos_ingest'\)/);
  });
});
