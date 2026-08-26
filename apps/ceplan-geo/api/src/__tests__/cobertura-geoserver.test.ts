import { describe, expect, it, vi, beforeEach } from "vitest";
import { reportGeoserverCoverage } from "../cli/cobertura-geoserver.js";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

beforeEach(() => {
  queryMock.mockReset();
});

describe("cobertura geoserver", () => {
  it("builds coverage report from database aggregates", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            layer_name: "geoceplan:cb_limdistx",
            feature_count: 1874,
            last_ingested_at: "2026-08-26T00:00:00.000Z",
            latest_batch_at: "2026-08-26T00:00:00.000Z",
            latest_checksum: "abc",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ departamento: "LA LIBERTAD", distritos: "80" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ infra_type: "puerto", total: "5" }] });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(String(value));
    };

    const report = await reportGeoserverCoverage();
    console.log = originalLog;

    expect(report.completitud).toBe("PARCIAL");
    expect(report.capas[0].layerName).toBe("geoceplan:cb_limdistx");
    expect(report.territorios.distritosPersistidos).toBe(80);
    expect(logs).toHaveLength(1);
  });
});
