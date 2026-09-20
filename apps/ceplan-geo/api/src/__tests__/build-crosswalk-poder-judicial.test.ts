import { describe, expect, it, vi, beforeEach } from "vitest";

const { poolQueryMock, clientQueryMock, connectMock, fetchPoderJudicialTerritoriosMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  connectMock: vi.fn(),
  fetchPoderJudicialTerritoriosMock: vi.fn(),
}));

// `territory-lookup.ts` (el matcher) usa `pool.query` directamente; el
// builder solo usa `client.query` (vía `pool.connect()`) para BEGIN/INSERT/
// COMMIT/ROLLBACK -- mismo split que `buildTerritoryCrosswalk` ya tiene con
// `lookupTerritoryByNames`, no es nuevo de este archivo.
vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock, connect: connectMock },
}));

vi.mock("../lib/api-clients.js", () => ({
  fetchPoderJudicialTerritorios: fetchPoderJudicialTerritoriosMock,
}));

const { buildTerritoryCrosswalkPoderJudicial, SIN_MATCH_DEPARTAMENTO } = await import("../crossref/build-crosswalk.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  clientQueryMock.mockReset();
  connectMock.mockReset();
  fetchPoderJudicialTerritoriosMock.mockReset();
  connectMock.mockResolvedValue({ query: clientQueryMock, release: vi.fn() });
  clientQueryMock.mockResolvedValue(undefined);
  poolQueryMock.mockResolvedValue({ rows: [] });
});

describe("buildTerritoryCrosswalkPoderJudicial", () => {
  it("inserta con source=poder-judicial y el departamento resuelto del match", async () => {
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: "TRUJILLO", distrito: "TRUJILLO", filas: 340 }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", geometry_geojson: null }],
    });

    const summary = await buildTerritoryCrosswalkPoderJudicial();

    expect(summary).toEqual({ triples: 1, confirmadas: 1, candidatas: 0, sinMatch: 0 });
    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO territory_name_crosswalk"));
    expect(insertCall?.[1]).toEqual(["LA LIBERTAD", "TRUJILLO", "TRUJILLO", "130101", "confirmada"]);
  });

  it("borra por (provincia, distrito, source) antes de insertar -- no por departamento (regresión del bug de filas SIN_MATCH huérfanas)", async () => {
    // Bug real encontrado en vivo 2026-09-20: un ON CONFLICT keyed por
    // (departamento, provincia, distrito, source) dejaba una fila
    // SIN_MATCH huérfana cuando una corrida posterior sí matcheaba (el
    // departamento, recién conocido, no calzaba contra la fila vieja). El
    // fix es borrar por la identidad real de esta fuente -- (provincia,
    // distrito, source) -- antes de insertar, sin importar qué
    // departamento tenía la fila anterior.
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: "NAZCA", distrito: "MARCONA", filas: 3 }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "110304", departamento: "ICA", provincia: "NASCA", distrito: "MARCONA", geometry_geojson: null }],
    });

    await buildTerritoryCrosswalkPoderJudicial();

    const deleteCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("DELETE FROM territory_name_crosswalk"));
    expect(deleteCall?.[0]).not.toMatch(/departamento/i);
    expect(deleteCall?.[1]).toEqual(["NAZCA", "MARCONA"]);

    const insertIndex = clientQueryMock.mock.calls.findIndex(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO territory_name_crosswalk"));
    const deleteIndex = clientQueryMock.mock.calls.findIndex(([sql]) => typeof sql === "string" && sql.includes("DELETE FROM territory_name_crosswalk"));
    expect(deleteIndex).toBeLessThan(insertIndex);
  });

  it("usa el departamento centinela SIN_MATCH cuando no hay match, sin adivinar uno real", async () => {
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: "NO EXISTE", distrito: "NO EXISTE", filas: 1 }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const summary = await buildTerritoryCrosswalkPoderJudicial();

    expect(summary).toEqual({ triples: 1, confirmadas: 0, candidatas: 0, sinMatch: 1 });
    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO territory_name_crosswalk"));
    expect(insertCall?.[1]).toEqual([SIN_MATCH_DEPARTAMENTO, "NO EXISTE", "NO EXISTE", null, "sin_match"]);
  });

  it("marca candidata cuando el match no es único a nivel nacional, y usa su primer departamento igual", async () => {
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: "SANTA", distrito: "SANTA", filas: 5 }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { ubigeo: "021801", departamento: "ANCASH", provincia: "SANTA", distrito: "SANTA", geometry_geojson: null },
        { ubigeo: "999999", departamento: "OTRO", provincia: "SANTA", distrito: "SANTA", geometry_geojson: null },
      ],
    });

    const summary = await buildTerritoryCrosswalkPoderJudicial();

    expect(summary).toEqual({ triples: 1, confirmadas: 0, candidatas: 1, sinMatch: 0 });
    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO territory_name_crosswalk"));
    expect(insertCall?.[1]).toEqual(["ANCASH", "SANTA", "SANTA", "021801", "candidata"]);
  });

  it("hace rollback y relanza si una query falla a mitad de la corrida", async () => {
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: "TRUJILLO", distrito: "TRUJILLO", filas: 1 }],
    });
    poolQueryMock.mockRejectedValueOnce(new Error("boom"));

    await expect(buildTerritoryCrosswalkPoderJudicial()).rejects.toThrow("boom");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("no llama a la base para una triada sin provincia ni distrito", async () => {
    fetchPoderJudicialTerritoriosMock.mockResolvedValue({
      territorios: [{ provincia: null, distrito: null, filas: 3 }],
    });

    const summary = await buildTerritoryCrosswalkPoderJudicial();

    expect(summary).toEqual({ triples: 1, confirmadas: 0, candidatas: 0, sinMatch: 0 });
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(clientQueryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes("INSERT"))).toBe(false);
  });
});
