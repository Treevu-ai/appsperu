import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("../db/pool.js", () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

import { consumeQuery, logUsage } from "../auth/rate-limiter.js";

describe("consumeQuery", () => {
  beforeEach(() => queryMock.mockReset());

  it("allows the call when the UPDATE ... RETURNING finds a row (budget available)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ queries_used: 3 }] });
    const result = await consumeQuery(1);
    expect(result).toEqual({ allowed: true });
  });

  it("denies the call when the guarded UPDATE matches no row (budget exhausted or key inactive)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await consumeQuery(1);
    expect(result).toEqual({ allowed: false, reason: "BUDGET_EXCEEDED" });
  });

  it("increments atomically in one statement (no separate read-then-write query)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ queries_used: 1 }] });
    await consumeQuery(7);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE mcp_api_keys/);
    expect(sql).toMatch(/queries_used = queries_used \+ 1/);
    expect(params).toEqual([7]);
  });
});

describe("logUsage", () => {
  beforeEach(() => queryMock.mockReset());

  it("logs success and failure calls with the tool name", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await logUsage({ keyId: 1, toolName: "infobras_public_work_by_codigo", success: true });
    await logUsage({ keyId: 1, toolName: "infobras_public_work_by_codigo", success: false, errorMessage: "BUDGET_EXCEEDED" });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][1]).toEqual([1, "infobras_public_work_by_codigo", true, null]);
    expect(queryMock.mock.calls[1][1]).toEqual([1, "infobras_public_work_by_codigo", false, "BUDGET_EXCEEDED"]);
  });
});
