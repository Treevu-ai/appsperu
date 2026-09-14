import { describe, expect, it, vi, beforeEach } from "vitest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();
const clientQueryMock = vi.fn();
const clientReleaseMock = vi.fn();
const poolConnectMock = vi.fn(() => Promise.resolve({ query: clientQueryMock, release: clientReleaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock, connect: poolConnectMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { buildCrosswalk } = await import("../crossref/build-crosswalk.js");

const EJECUCION_ENTITY = { entity_code: "1234", nombre: "MUNICIPALIDAD DISTRITAL DE MOCHE" };
const INFOBRAS_ENTITY = { codigo_entidad: "infobras-1", entidad_nombre: "MUNICIPALIDAD DISTRITAL DE MOCHE" };

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
  clientQueryMock.mockReset();
  clientReleaseMock.mockReset();
  clientQueryMock.mockResolvedValue({ rows: [] });
});

describe("buildCrosswalk (infobras)", () => {
  it("borra por ejecucion_entity_code (scoped por departamento), no por infobras_codigo_entidad — hallazgo CodeRabbit PR #144", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [EJECUCION_ENTITY] });
    poolQueryMock.mockResolvedValueOnce({ rows: [INFOBRAS_ENTITY] });

    await buildCrosswalk("LA LIBERTAD");

    const deleteCall = clientQueryMock.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM entity_crosswalk"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toMatch(/WHERE ejecucion_entity_code = ANY/);
    expect(deleteCall![0]).not.toMatch(/infobras_codigo_entidad/);
    expect(deleteCall![1]).toEqual([["1234"]]);
  });

  it("sigue borrando filas obsoletas aunque INFOBRAS no traiga ninguna obra para el departamento (bug real: con infobras_codigo_entidad el DELETE se saltaba por completo)", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [EJECUCION_ENTITY] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] }); // 0 obras INFOBRAS para el departamento

    await buildCrosswalk("LA LIBERTAD");

    const deleteCall = clientQueryMock.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM entity_crosswalk"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1]).toEqual([["1234"]]);
  });

  it("advierte por consola cuando 0 entidades radar-ejecucion para el departamento (mismo riesgo de no-op silencioso, ahora del otro lado)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [] }); // 0 entidades radar-ejecucion para el departamento
    poolQueryMock.mockResolvedValueOnce({ rows: [INFOBRAS_ENTITY] });

    await buildCrosswalk("DEPARTAMENTO_SIN_ENTIDADES");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("0 entidades radar-ejecucion"));
    warnSpy.mockRestore();
  });
});
