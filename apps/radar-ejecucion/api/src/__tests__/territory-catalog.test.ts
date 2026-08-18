import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { loadTerritoryCatalog } = await import("../ingest/territory-catalog.js");

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
});

describe("loadTerritoryCatalog", () => {
  it("upserts every record inside a transaction and releases the client", async () => {
    queryMock.mockResolvedValue({});

    const count = await loadTerritoryCatalog(
      [
        { ubigeo: "150101", departamento: "Lima", provincia: "Lima", distrito: "Lima" },
        { ubigeo: "150102", departamento: "Lima", provincia: "Lima", distrito: "Ancón" },
      ],
      "INEI",
      "2026-01-01"
    );

    expect(count).toBe(2);
    expect(queryMock).toHaveBeenCalledWith("BEGIN");
    expect(queryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rolls back and rethrows when an insert fails", async () => {
    queryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(new Error("db exploded")); // first insert

    await expect(
      loadTerritoryCatalog(
        [{ ubigeo: "150101", departamento: "Lima", provincia: null, distrito: null }],
        "INEI",
        "2026-01-01"
      )
    ).rejects.toThrow("db exploded");

    expect(queryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
