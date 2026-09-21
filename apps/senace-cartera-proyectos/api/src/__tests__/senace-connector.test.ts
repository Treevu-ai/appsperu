import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestSenace } = await import("../ingest/senace-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function proyectoRow(overrides: Record<string, unknown> = {}) {
  return {
    ID: 7,
    TITULAR: "AUTOPISTA DEL NORTE S.A.C",
    RUC: "20520929658",
    TITULO_PROYECTO: "PROYECTO DE REHABILITACIÓN",
    UNIDAD_PROYECTO: "EVAP",
    TIPO: "Clasificación",
    ACTIVIDAD: "Transportes",
    FECHA_INICIO: "29/03/2019",
    ESTADO: "Aprobado",
    DESCRIPCION: "SIN DESCRIPCION",
    LONGITUD: -78.39,
    LATITUD: -9.37,
    RESOLUCION: "RD N° 00042-2020-SENACE-PE/DEIN",
    LABEL: null,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_senace_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestSenace", () => {
  it("ingiere los 3 estados conocidos con una llamada por estado", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [proyectoRow({ ID: 1, ESTADO: "Aprobado" })] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }));

    const summary = await ingestSenace();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("q=Aprobado");
    expect(fetchMock.mock.calls[1][0]).toContain("q=Desaprobado");
    expect(fetchMock.mock.calls[2][0]).toContain("q=En%20Evaluacion");
    expect(summary.estados).toHaveLength(3);
    expect(summary.estados[0]).toMatchObject({ filasInsertadas: 1, filasRechazadas: 0 });
  });

  it("lanza un error si la respuesta no tiene 'datos.data' como arreglo, sin tratarla como dataset vacío", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ datos: {} }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }));

    await expect(ingestSenace()).rejects.toThrow(/Aprobado/);
  });

  it("borra, dentro de la misma transacción, los proyectos de ese estado que no vinieron en esta corrida", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [proyectoRow()] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }));

    await ingestSenace();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM senace_cartera_proyectos"));
    expect(deleteCalls).toHaveLength(3); // una vez por cada estado (Aprobado, Desaprobado, En Evaluación)
    expect(deleteCalls[0][1]).toEqual(["Aprobado", 1]);
    // El estado "En Evaluacion" (param sin tilde) borra por el label real "En Evaluación" -- no
    // por el param crudo, para que coincida con lo que realmente quedó guardado en `estado`.
    expect(deleteCalls[2][1]).toEqual(["En Evaluación", 1]);
  });

  it("hace rollback y sigue con los demás estados si uno falla, y lanza al final con el detalle", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false)) // Aprobado falla
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }))
      .mockResolvedValueOnce(jsonResponse({ datos: { data: [] } }));

    await expect(ingestSenace()).rejects.toThrow(/Aprobado/);
    expect(releaseMock).toHaveBeenCalled();
  });
});
