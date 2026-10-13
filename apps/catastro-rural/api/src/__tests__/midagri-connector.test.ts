import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock, query: queryMock },
}));

const { ingestMidagri } = await import("../ingest/midagri-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function esriFeature(overrides: Record<string, unknown> = {}) {
  return {
    attributes: {
      OBJECTID: 1,
      AREA_HA: 10.5,
      PERIMETRO: 1200,
      ID_DIST: "130101",
      NOM_DPTO: "LA LIBERTAD",
      NOM_PROV: "JULCAN",
      NOM_DIST: "QUIRUVILCA",
      NOMBRE: "Predio Test",
      ESTADO: "TITULADO",
      FUENTE: "UEGPS",
      geometry: { rings: [[[-78.5, -8.2], [-78.4, -8.2], [-78.4, -8.1], [-78.5, -8.1], [-78.5, -8.2]]] },
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
    if (sql.includes("pg_try_advisory_lock")) {
      return Promise.resolve({ rows: [{ locked: true }] });
    }
    if (sql.includes("pg_advisory_unlock")) {
      return Promise.resolve({ rows: [{ unlocked: true }] });
    }
    if (sql.includes("INSERT INTO raw_midagri_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    if (sql.includes("count(DISTINCT objectid) FROM catastro_rural")) {
      // Postgres SIEMPRE devuelve una fila para COUNT(*), incluso en 0.
      return Promise.resolve({ rows: [{ count: "0" }] });
    }
    if (sql.includes("SELECT id FROM raw_midagri_batches")) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
  // Por defecto: returnCountOnly=true -> 0 features (capa vacía); cualquier
  // otra consulta de datos -> sin features. Cada capa ahora SIEMPRE arranca
  // con una consulta de conteo (returnCountOnly) antes de paginar.
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
    return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
  });
});

describe("ingestMidagri", () => {
  it("ingiere las 10 capas conocidas, una llamada por capa", async () => {
    const summary = await ingestMidagri();

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(summary.capas).toHaveLength(10);
    // Verifica que se consultan los layerIds 0-9
    for (let i = 0; i < 10; i++) {
      expect(fetchMock.mock.calls[i][0]).toContain(`/MapServer/${i}/query`);
    }
  });

  it("usa paginación por offset/limit (resultOffset/resultRecordCount) y itera mientras exceededTransferLimit=true", async () => {
    // Primera página con 1000 features, exceededTransferLimit=true
    // Segunda página con 50 features, exceededTransferLimit=false
    const page1 = { features: Array.from({ length: 1000 }, (_, i) => esriFeature({ OBJECTID: i + 1 })), exceededTransferLimit: true };
    const page2 = { features: Array.from({ length: 50 }, (_, i) => esriFeature({ OBJECTID: 1001 + i })), exceededTransferLimit: false };

    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/MapServer/0/query") && url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 1050 }));
      if (url.includes("/MapServer/0/query") && url.includes("resultOffset=0")) return Promise.resolve(jsonResponse(page1));
      if (url.includes("/MapServer/0/query") && url.includes("resultOffset=1000")) return Promise.resolve(jsonResponse(page2));
      if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
      return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
    });

    const summary = await ingestMidagri();
    const predioRural = summary.capas.find((c) => c.layerId === 0);
    expect(predioRural?.filasOrigen).toBe(1050);
    expect(predioRural?.filasInsertadas).toBe(1050);
  });

  it("lanza un error si la respuesta no tiene 'features' como arreglo", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/MapServer/0/query") && url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 1 }));
      if (url.includes("/MapServer/0/query")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
      return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
    });

    await expect(ingestMidagri()).rejects.toThrow(/capa_0/);
  });

  it("borra, dentro de la misma transacción, todas las filas existentes de esa capa antes de insertar (snapshot completo)", async () => {
    await ingestMidagri();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM catastro_rural WHERE"));
    expect(deleteCalls).toHaveLength(10);
    expect(deleteCalls[0][1]).toEqual(["predio_rural"]);
  });

  it("sigue con las demás capas si una falla, y lanza al final con el detalle", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/MapServer/0/query") && url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 1 }));
      if (url.includes("/MapServer/0/query")) {
        return Promise.resolve(jsonResponse({}, false));
      }
      if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
      return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
    });

    await expect(ingestMidagri()).rejects.toThrow(/capa_0/);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("guarda record_count con el total de la fuente (incluye rechazadas), no solo lo insertado", async () => {
    // Una feature válida + una sin attributes (rechazada) - solo para la primera capa
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/MapServer/0/query") && url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 2 }));
      if (url.includes("/MapServer/0/query")) {
        return Promise.resolve(jsonResponse({ features: [esriFeature({ OBJECTID: 1 }), { attributes: null }] }));
      }
      if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
      return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
    });

    await ingestMidagri();

    const updateCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("UPDATE raw_midagri_batches"));
    expect(updateCalls[0][1]).toEqual([2, 1]); // 2 features de origen (1 insertada + 1 rechazada), no 1
  });

  it("toma y libera un advisory lock de sesión por capa, balanceado", async () => {
    await ingestMidagri();

    const lockCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("pg_try_advisory_lock"));
    const unlockCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("pg_advisory_unlock"));
    expect(lockCalls).toHaveLength(10);
    expect(unlockCalls).toHaveLength(10);
    // Cada lock/unlock usa la misma clave numérica derivada del nombre de capa
    expect(lockCalls[0][1]).toEqual(unlockCalls[0][1]);
  });

  it("no reingesta una capa que ya tiene todas sus filas únicas (evita el bug de arranque-limpio en falso)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/MapServer/0/query") && url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 5 }));
      if (url.includes("returnCountOnly=true")) return Promise.resolve(jsonResponse({ count: 0 }));
      return Promise.resolve(jsonResponse({ features: [], exceededTransferLimit: false }));
    });
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) return Promise.resolve({ rows: [{ locked: true }] });
      if (sql.includes("pg_advisory_unlock")) return Promise.resolve({ rows: [{ unlocked: true }] });
      if (sql.includes("count(DISTINCT objectid) FROM catastro_rural")) return Promise.resolve({ rows: [{ count: "5" }] });
      if (sql.includes("SELECT id FROM raw_midagri_batches")) return Promise.resolve({ rows: [{ id: 7 }] });
      return Promise.resolve({ rows: [] });
    });

    const summary = await ingestMidagri();
    const predioRural = summary.capas.find((c) => c.layerId === 0);

    expect(predioRural?.filasInsertadas).toBe(5);
    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM catastro_rural WHERE"));
    expect(deleteCalls).toHaveLength(0); // ninguna capa debe borrarse si ya está completa
    const fetchCalls = fetchMock.mock.calls.filter(([url]) => typeof url === "string" && !url.includes("returnCountOnly"));
    expect(fetchCalls.filter((c) => c[0].includes("/MapServer/0/query"))).toHaveLength(0); // no vuelve a paginar
  });
});