import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestSerfor } = await import("../ingest/serfor-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function esriFeature(overrides: Record<string, unknown> = {}) {
  return { attributes: { OBJECTID: 1, FUENTE: "DGFFS", NOMDEP: "22", ...overrides } };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_serfor_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
  // 10 capas -- por defecto todas devuelven un dataset vacío salvo que un test sobreescriba.
  fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
});

describe("ingestSerfor", () => {
  it("ingiere las 10 capas conocidas, una llamada por capa", async () => {
    const summary = await ingestSerfor();

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(summary.capas).toHaveLength(10);
    expect(fetchMock.mock.calls[0][0]).toContain("Modalidad_Acceso/MapServer/0/query");
    expect(fetchMock.mock.calls[6][0]).toContain("Modalidad_Acceso/MapServer/6/query");
    expect(fetchMock.mock.calls[7][0]).toContain("Ordenamiento_Forestal/MapServer/0/query");
  });

  it("cuenta filas insertadas reales cuando la capa trae datos", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("Modalidad_Acceso/MapServer/6/query")) {
        return Promise.resolve(jsonResponse({ features: [esriFeature({ OBJECTID: 16850 })] }));
      }
      return Promise.resolve(jsonResponse({ features: [] }));
    });

    const summary = await ingestSerfor();
    const concesiones = summary.capas.find((c) => c.capa === "modalidad_concesiones_forestales");
    expect(concesiones).toMatchObject({ filasInsertadas: 1, filasRechazadas: 0 });
  });

  it("lanza un error si la respuesta no tiene 'features' como arreglo, sin tratarla como capa vacía", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({})));

    await expect(ingestSerfor()).rejects.toThrow(/modalidad_permisos/);
  });

  it("aborta la capa si exceededTransferLimit es true, en vez de confirmar un snapshot truncado", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: true })));

    await expect(ingestSerfor()).rejects.toThrow(/exceededTransferLimit/);
  });

  it("borra, dentro de la misma transacción, todas las filas existentes de esa capa antes de insertar (snapshot completo)", async () => {
    await ingestSerfor();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM catastro_forestal_titulos"));
    expect(deleteCalls).toHaveLength(10);
    expect(deleteCalls[0][1]).toEqual(["modalidad_permisos"]);
  });

  it("hace rollback y sigue con las demás capas si una falla, y lanza al final con el detalle", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({}, false)));

    await expect(ingestSerfor()).rejects.toThrow(/modalidad_permisos/);
    expect(releaseMock).toHaveBeenCalled();
  });
});
