import { describe, expect, it, vi, beforeEach } from "vitest";

const poolQueryMock = vi.fn();
const radarQueryMock = vi.fn();
const clientQueryMock = vi.fn();
const clientReleaseMock = vi.fn();
const poolConnectMock = vi.fn(() => Promise.resolve({ query: clientQueryMock, release: clientReleaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock, connect: poolConnectMock },
}));
vi.mock("../db/radar-pool.js", () => ({
  radarPool: { query: radarQueryMock },
}));

const { buildCrosswalk } = await import("../crossref/build-crosswalk.js");

const MEF_ENTITY = { entity_code: "1234", nombre: "MUNICIPALIDAD DISTRITAL DE MOCHE" };
const OECE_BUYER = { buyer_id: "oece-1", buyer_name: "MUNICIPALIDAD DISTRITAL DE MOCHE" };

beforeEach(() => {
  poolQueryMock.mockReset();
  radarQueryMock.mockReset();
  clientQueryMock.mockReset();
  clientReleaseMock.mockReset();
  clientQueryMock.mockResolvedValue({ rows: [] });
});

describe("buildCrosswalk (compras-publicas)", () => {
  it("borra por mef_entity_code (scoped por departamento), no por oece_buyer_id — hallazgo CodeRabbit PR #144", async () => {
    radarQueryMock.mockResolvedValueOnce({ rows: [MEF_ENTITY] });
    poolQueryMock.mockResolvedValueOnce({ rows: [OECE_BUYER] });

    await buildCrosswalk("LA LIBERTAD");

    const deleteCall = clientQueryMock.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM entity_crosswalk"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toMatch(/WHERE mef_entity_code = ANY/);
    expect(deleteCall![0]).not.toMatch(/oece_buyer_id/);
    expect(deleteCall![1]).toEqual([["1234"]]);
  });

  it("sigue borrando filas obsoletas aunque OECE no traiga ningún buyer para el departamento (bug real: con oece_buyer_id el DELETE se saltaba por completo)", async () => {
    radarQueryMock.mockResolvedValueOnce({ rows: [MEF_ENTITY] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] }); // 0 buyers OECE para el departamento

    await buildCrosswalk("LA LIBERTAD");

    const deleteCall = clientQueryMock.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("DELETE FROM entity_crosswalk"),
    );
    expect(deleteCall).toBeDefined();
    // Con el fix, el DELETE sigue corriendo con la lista de entidades MEF del
    // departamento (no vacía) — antes del fix, con oece_buyer_id, la lista de
    // buyers vacía hacía que `ANY('{}')` no borrara nada, dejando filas huérfanas.
    expect(deleteCall![1]).toEqual([["1234"]]);
  });

  it("advierte por consola cuando 0 entidades MEF para el departamento (mismo riesgo de no-op silencioso, ahora del otro lado)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    radarQueryMock.mockResolvedValueOnce({ rows: [] }); // 0 entidades MEF para el departamento
    poolQueryMock.mockResolvedValueOnce({ rows: [OECE_BUYER] });

    await buildCrosswalk("DEPARTAMENTO_SIN_ENTIDADES");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("0 entidades MEF"));
    warnSpy.mockRestore();
  });
});
