import { describe, expect, it, vi, beforeEach } from "vitest";
import { countPilotDistricts, PILOT_DEPARTMENTS } from "../lib/pilot-departments.js";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

beforeEach(() => {
  queryMock.mockReset();
});

describe("countPilotDistricts", () => {
  it("returns district counts for all 5 pilot departments", async () => {
    queryMock.mockResolvedValueOnce({
      rows: PILOT_DEPARTMENTS.map((row) => ({
        departamento: row.name,
        distritos: String(row.expectedDistricts),
      })),
    });

    const counts = await countPilotDistricts();
    for (const expected of PILOT_DEPARTMENTS) {
      expect(counts[expected.name]).toBe(expected.expectedDistricts);
    }
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("FROM territories"), [
      PILOT_DEPARTMENTS.map((row) => row.name),
    ]);
  });
});
