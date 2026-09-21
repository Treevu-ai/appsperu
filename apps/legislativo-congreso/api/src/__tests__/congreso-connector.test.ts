import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestCongreso } = await import("../ingest/congreso-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

const PERIODOS_RESPONSE = { code: 200, data: [{ perParId: 2021 }, { perParId: 2026 }] };

function proyectoRow(overrides: Record<string, unknown> = {}) {
  return {
    perParId: 2021,
    pleyNum: 14864,
    proyectoLey: "14864/2025-CR",
    desEstado: "PRESENTADO",
    fecPresentacion: "2026-07-22T00:00:00.000-05:00",
    titulo: "PROYECTO DE LEY...",
    desProponente: "Congreso",
    autores: "Luque Ibarra, Ruth",
    codTipoParl: "C",
    codTipoParlActual: "C",
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  // Toda query dentro de la transacción (BEGIN, INSERT batch, upsert, DELETE, UPDATE, COMMIT)
  // resuelve genéricamente salvo que un test la sobreescriba explícitamente.
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_congreso_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestCongreso", () => {
  it("descubre los periodos válidos en vivo antes de ingerir cada uno", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PERIODOS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [proyectoRow()] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [] } }));

    const summary = await ingestCongreso();

    expect(summary.periodosDescubiertos).toEqual([2021, 2026]);
    expect(summary.periodos).toHaveLength(2);
    expect(summary.periodos[0]).toMatchObject({ perParId: 2021, filasInsertadas: 1, filasRechazadas: 0 });
    expect(summary.periodos[1]).toMatchObject({ perParId: 2026, filasInsertadas: 0 });
  });

  it("deduplica filas con la misma clave (perParId+pleyNum) antes del INSERT, no deja que Postgres aborte", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PERIODOS_RESPONSE))
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { proyectos: [proyectoRow(), proyectoRow({ titulo: "VERSIÓN DUPLICADA" })] } })
      )
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [] } }));

    const summary = await ingestCongreso();

    const insertCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("INSERT INTO legislativo_congreso_proyectos"));
    expect(insertCalls).toHaveLength(1);
    // Solo una tupla de VALUES para las dos filas con la misma clave -- la deduplicación ocurre
    // dentro de upsertBatch, después de que normalizeProyectos ya contó las 2 filas de origen en
    // `filasInsertadas` (ese conteo refleja filas normalizadas, no filas físicamente insertadas).
    expect(insertCalls[0][1]).toHaveLength(11); // UPSERT_COLUMNS.length para 1 sola fila
    expect(summary.periodos[0].filasInsertadas).toBe(2);
  });

  it("borra, dentro de la misma transacción, los proyectos de ese periodo que no vinieron en esta corrida", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PERIODOS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [proyectoRow()] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [] } }));

    await ingestCongreso();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM legislativo_congreso_proyectos"));
    expect(deleteCalls).toHaveLength(2); // una vez por cada periodo ingerido (2021, 2026)
    expect(deleteCalls[0][0]).toMatch(/source_batch_id <> \$2/);
  });

  it("hace rollback y sigue con los demás periodos si uno falla, y lanza al final con el detalle", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(PERIODOS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({}, false)) // periodo 2021 falla
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { proyectos: [] } })); // periodo 2026 sí

    await expect(ingestCongreso()).rejects.toThrow(/periodo 2021/);
    expect(releaseMock).toHaveBeenCalled();
  });
});
