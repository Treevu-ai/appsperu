import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestSernanp } = await import("../ingest/sernanp-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function anpFeature(objectid: number) {
  return {
    attributes: {
      objectid,
      anp_codi: "PN05",
      anp_cate: "Parque Nacional",
      anp_nomb: "Cerros de Amotape",
      anp_ubpo: "Tumbes y Piura",
      anp_suleg: 152045.13,
    },
  };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_sernanp_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
  // 5 capas -- cada una responde con una feature real por defecto.
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ features: [anpFeature(1)] })));
});

describe("ingestSernanp", () => {
  it("ingiere las 5 capas conocidas", async () => {
    const summary = await ingestSernanp();
    expect(summary.capas).toHaveLength(5);
    expect(summary.capas.map((c) => c.capa)).toEqual([
      "anp_nacional_definitiva",
      "zona_reservada",
      "area_conservacion_regional",
      "area_conservacion_privada",
      "sitios_prioritarios",
    ]);
  });

  it("borra todas las filas de la capa antes de insertar -- snapshot completo, no upsert incremental", async () => {
    await ingestSernanp();
    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM sernanp_areas WHERE capa"));
    expect(deleteCalls).toHaveLength(5);
  });

  it("no usa ON CONFLICT en el INSERT -- no hay clave de upsert por diseño", async () => {
    await ingestSernanp();
    const insertCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("INSERT INTO sernanp_areas"));
    expect(insertCalls.length).toBeGreaterThan(0);
    for (const [sql] of insertCalls) {
      expect(sql).not.toMatch(/ON CONFLICT/);
    }
  });

  it("hace rollback y sigue con las demás capas si una falla, y lanza al final con el detalle", async () => {
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      if (call === 2) return Promise.resolve(jsonResponse({}, false)); // zona_reservada falla
      return Promise.resolve(jsonResponse({ features: [anpFeature(1)] }));
    });

    await expect(ingestSernanp()).rejects.toThrow(/zona_reservada/);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("rechaza una respuesta HTTP 200 sin 'features' como array -- no la trata como capa vacía (hallazgo real de Copilot)", async () => {
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(jsonResponse({ code: 200 })); // sin "features"
      return Promise.resolve(jsonResponse({ features: [anpFeature(1)] }));
    });

    await expect(ingestSernanp()).rejects.toThrow(/sin "features"/);
  });

  it("aborta la capa si exceededTransferLimit=true en vez de confirmar un snapshot truncado (hallazgo real de Copilot)", async () => {
    let call = 0;
    fetchMock.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(jsonResponse({ features: [anpFeature(1)], exceededTransferLimit: true }));
      return Promise.resolve(jsonResponse({ features: [anpFeature(1)] }));
    });

    await expect(ingestSernanp()).rejects.toThrow(/exceededTransferLimit/);

    // No debe haber llegado a borrar la tabla de esa capa con datos truncados.
    const deleteCalls = queryMock.mock.calls.filter(
      ([sql, params]) => sql.includes("DELETE FROM sernanp_areas") && params?.[0] === "anp_nacional_definitiva"
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it("adquiere un advisory lock por capa antes de tocar la tabla, para serializar corridas concurrentes (hallazgo real de Copilot)", async () => {
    await ingestSernanp();

    const lockCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("pg_advisory_xact_lock"));
    expect(lockCalls).toHaveLength(5); // una por capa
    expect(lockCalls[0][0]).toMatch(/hashtext\('sernanp_areas_ingest'\), hashtext\(\$1\)/);
    expect(lockCalls[0][1]).toEqual(["anp_nacional_definitiva"]);
  });
});
