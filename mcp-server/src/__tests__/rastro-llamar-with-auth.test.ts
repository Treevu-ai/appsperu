import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeQueryMock = vi.fn();
const logUsageMock = vi.fn();
vi.mock("../auth/rate-limiter.js", () => ({
  consumeQuery: (...args: unknown[]) => consumeQueryMock(...args),
  logUsage: (...args: unknown[]) => logUsageMock(...args),
}));

const callApiMock = vi.fn();
vi.mock("../http-client.js", async () => {
  const actual = await vi.importActual<typeof import("../http-client.js")>("../http-client.js");
  return { ...actual, callApi: (...args: unknown[]) => callApiMock(...args) };
});

import { runRastroLlamarWithAuth } from "../index.js";
import type { ApiKeyRecord } from "../auth/api-key.js";

function makeActiveKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 1,
    keyHash: "hash",
    keyPrefix: "sk-rastro-abcdef",
    tier: "workshop",
    groupId: "taller-1",
    workshopId: null,
    queryLimit: 100,
    queriesUsed: 0,
    isActive: true,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

// Cualquier tool real del catálogo sirve — usamos uno existente para pasar por
// el camino real de invokeTool/callApi (mockeado) en vez de por el atajo de
// "tool no existe".
const REAL_TOOL = "infobras_public_work_by_codigo";

describe("runRastroLlamarWithAuth", () => {
  beforeEach(() => {
    consumeQueryMock.mockReset();
    logUsageMock.mockReset();
    callApiMock.mockReset();
  });

  it("sin activeKey no consume presupuesto ni loguea uso", async () => {
    callApiMock.mockResolvedValueOnce({ status: 200, body: { ok: true } });
    const result = await runRastroLlamarWithAuth(null, REAL_TOOL, { codigoInfobras: "123" });
    expect(result.isError).toBeFalsy();
    expect(consumeQueryMock).not.toHaveBeenCalled();
    expect(logUsageMock).not.toHaveBeenCalled();
  });

  it("bloquea la llamada real cuando el presupuesto ya se agotó, sin tocar la API", async () => {
    consumeQueryMock.mockResolvedValueOnce({ allowed: false, reason: "BUDGET_EXCEEDED" });
    const result = await runRastroLlamarWithAuth(makeActiveKey(), REAL_TOOL, { codigoInfobras: "123" });
    expect(result.isError).toBe(true);
    expect(callApiMock).not.toHaveBeenCalled();
  });

  it("REGRESIÓN: un fallo de logUsage no enmascara un resultado real ya obtenido", async () => {
    // Este es exactamente el hallazgo HIGH del code review: antes, un logUsage
    // sin try/catch propagaba su excepción y el SDK de MCP devolvía un error
    // genérico en vez del resultado real ya pagado con presupuesto.
    consumeQueryMock.mockResolvedValueOnce({ allowed: true });
    callApiMock.mockResolvedValueOnce({ status: 200, body: { obra: "real" } });
    logUsageMock.mockRejectedValueOnce(new Error("blip transitorio de Postgres"));

    const result = await runRastroLlamarWithAuth(makeActiveKey(), REAL_TOOL, { codigoInfobras: "123" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("real");
  });

  it("con presupuesto disponible, consume la query y loguea éxito", async () => {
    consumeQueryMock.mockResolvedValueOnce({ allowed: true });
    callApiMock.mockResolvedValueOnce({ status: 200, body: { ok: true } });
    logUsageMock.mockResolvedValueOnce(undefined);

    const activeKey = makeActiveKey();
    await runRastroLlamarWithAuth(activeKey, REAL_TOOL, { codigoInfobras: "123" });

    expect(consumeQueryMock).toHaveBeenCalledWith(activeKey.id);
    expect(logUsageMock).toHaveBeenCalledWith(expect.objectContaining({ keyId: activeKey.id, toolName: REAL_TOOL, success: true }));
  });
});
