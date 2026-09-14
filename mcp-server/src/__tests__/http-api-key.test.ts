import { describe, expect, it, vi, beforeEach } from "vitest";

const validateApiKeyMock = vi.fn();
vi.mock("../auth/api-key.js", () => ({ validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args) }));

import { requireApiKey } from "../auth/http-api-key.js";

function makeReq(headers: Record<string, string> = {}) {
  return { header: (name: string) => headers[name.toLowerCase()] } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireApiKey (Fase 1-D, HTTP)", () => {
  beforeEach(() => validateApiKeyMock.mockReset());

  it("returns 401 without ever calling validateApiKey when x-api-key is missing", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(validateApiKeyMock).not.toHaveBeenCalled();
  });

  it("returns 401 with the specific reason when the key is invalid", async () => {
    validateApiKeyMock.mockResolvedValueOnce({ ok: false, reason: "EXPIRED" });
    const req = makeReq({ "x-api-key": "sk-rastro-vencida" });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("venció") }));
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the resolved key to req.apiKey and calls next() when valid", async () => {
    const key = { id: 1, groupId: "taller-1" };
    validateApiKeyMock.mockResolvedValueOnce({ ok: true, key });
    const req = makeReq({ "x-api-key": "sk-rastro-valida" });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey()(req, res, next);

    expect(req.apiKey).toBe(key);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
