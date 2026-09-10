import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("../db/pool.js", () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

import { hashApiKey, generateApiKey, validateApiKey, createApiKey, revokeApiKey } from "../auth/api-key.js";

describe("hashApiKey / generateApiKey", () => {
  it("hashes the same input to the same value, deterministically", () => {
    expect(hashApiKey("sk-rastro-abc")).toBe(hashApiKey("sk-rastro-abc"));
  });

  it("hashes different inputs to different values", () => {
    expect(hashApiKey("sk-rastro-abc")).not.toBe(hashApiKey("sk-rastro-def"));
  });

  it("never returns the raw key as its own hash", () => {
    const raw = "sk-rastro-abc";
    expect(hashApiKey(raw)).not.toBe(raw);
  });

  it("generates keys with the sk-rastro- prefix and a random suffix", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.startsWith("sk-rastro-")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("validateApiKey", () => {
  beforeEach(() => queryMock.mockReset());

  const baseRow = {
    id: 1,
    key_hash: "hash",
    key_prefix: "sk-rastro-abcdef",
    tier: "workshop",
    group_id: "taller-1",
    workshop_id: null,
    query_limit: 100,
    queries_used: 0,
    is_active: true,
    expires_at: null,
    revoked_at: null,
  };

  it("returns NOT_FOUND when no row matches the hash", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await validateApiKey("sk-rastro-noexiste");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("returns INACTIVE for a deactivated key even if budget remains", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...baseRow, is_active: false }] });
    const result = await validateApiKey("sk-rastro-x");
    expect(result).toEqual({ ok: false, reason: "INACTIVE" });
  });

  it("returns REVOKED for a key with revoked_at set, even if is_active was left true", async () => {
    // Regresión: revoked_at existía en la migración pero nunca se chequeaba.
    queryMock.mockResolvedValueOnce({ rows: [{ ...baseRow, is_active: true, revoked_at: "2026-09-09T00:00:00Z" }] });
    const result = await validateApiKey("sk-rastro-x");
    expect(result).toEqual({ ok: false, reason: "REVOKED" });
  });

  it("returns EXPIRED for a key past its expires_at", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...baseRow, expires_at: "2020-01-01T00:00:00Z" }] });
    const result = await validateApiKey("sk-rastro-x");
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("returns BUDGET_EXCEEDED when queries_used already reached query_limit", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...baseRow, queries_used: 100, query_limit: 100 }] });
    const result = await validateApiKey("sk-rastro-x");
    expect(result).toEqual({ ok: false, reason: "BUDGET_EXCEEDED" });
  });

  it("returns ok with the mapped record for a valid, active, in-budget key", async () => {
    queryMock.mockResolvedValueOnce({ rows: [baseRow] });
    const result = await validateApiKey("sk-rastro-x");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.key.id).toBe(1);
      expect(result.key.groupId).toBe("taller-1");
      expect(result.key.queryLimit).toBe(100);
    }
  });
});

describe("createApiKey", () => {
  beforeEach(() => queryMock.mockReset());

  it("inserts a hash of the generated key, never the raw key itself", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const { rawKey, id } = await createApiKey({ groupId: "taller-2", queryLimit: 50 });

    expect(id).toBe(42);
    expect(rawKey.startsWith("sk-rastro-")).toBe(true);

    const [, params] = queryMock.mock.calls[0];
    const insertedHash = (params as unknown[])[0];
    expect(insertedHash).toBe(hashApiKey(rawKey));
    expect(insertedHash).not.toBe(rawKey);
  });
});

describe("revokeApiKey", () => {
  beforeEach(() => queryMock.mockReset());

  it("sets both is_active=false and revoked_at, so validation catches it either way", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await revokeApiKey(1);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/is_active = false/);
    expect(sql).toMatch(/revoked_at = now\(\)/);
    expect(params).toEqual([1]);
  });
});
