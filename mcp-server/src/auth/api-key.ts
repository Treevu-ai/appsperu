import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db/pool.js";

const KEY_PREFIX = "sk-rastro-";

/** El código plano nunca se guarda — solo su hash SHA-256 en `mcp_api_keys.key_hash`. */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

/** Genera un código nuevo: `sk-rastro-<32 hex>`. Se muestra una sola vez al emitirse; no es recuperable después. */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(16).toString("hex")}`;
}

export interface ApiKeyRecord {
  id: number;
  keyHash: string;
  keyPrefix: string;
  tier: string;
  groupId: string | null;
  workshopId: string | null;
  queryLimit: number;
  queriesUsed: number;
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type ApiKeyValidationResult =
  | { ok: true; key: ApiKeyRecord }
  | { ok: false; reason: "NOT_FOUND" | "INACTIVE" | "REVOKED" | "EXPIRED" | "BUDGET_EXCEEDED" };

interface ApiKeyRow {
  id: number;
  key_hash: string;
  key_prefix: string;
  tier: string;
  group_id: string | null;
  workshop_id: string | null;
  query_limit: number;
  queries_used: number;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
}

function toRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    tier: row.tier,
    groupId: row.group_id,
    workshopId: row.workshop_id,
    queryLimit: row.query_limit,
    queriesUsed: row.queries_used,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Valida un código `sk-rastro-...` contra su hash almacenado y contra el
 * presupuesto de queries. No incrementa el contador — eso lo hace
 * `rate-limiter.ts` por cada llamada real a `rastro_llamar`, no en cada
 * arranque del proceso.
 */
export async function validateApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
  const keyHash = hashApiKey(rawKey);
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT id, key_hash, key_prefix, tier, group_id, workshop_id, query_limit, queries_used, is_active, expires_at, revoked_at
     FROM mcp_api_keys WHERE key_hash = $1`,
    [keyHash]
  );
  if (rows.length === 0) return { ok: false, reason: "NOT_FOUND" };

  const record = toRecord(rows[0]);
  if (!record.isActive) return { ok: false, reason: "INACTIVE" };
  // CT-mcp-keys (security review 2026-09-09): `revoked_at` existía en la migración
  // pero nunca se chequeaba acá — un código "revocado" seteando esta columna en vez
  // de `is_active=false` habría seguido pasando como válido.
  if (record.revokedAt) return { ok: false, reason: "REVOKED" };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (record.queriesUsed >= record.queryLimit) return { ok: false, reason: "BUDGET_EXCEEDED" };

  return { ok: true, key: record };
}

export interface CreateApiKeyInput {
  tier?: string;
  groupId?: string;
  workshopId?: string;
  queryLimit: number;
  expiresAt?: Date;
}

/** Emite un código nuevo y devuelve el código en texto plano — única vez que existe fuera de la memoria del proceso. */
export async function createApiKey(input: CreateApiKeyInput): Promise<{ rawKey: string; id: number }> {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 6);

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO mcp_api_keys (key_hash, key_prefix, tier, group_id, workshop_id, query_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [keyHash, keyPrefix, input.tier ?? "workshop", input.groupId ?? null, input.workshopId ?? null, input.queryLimit, input.expiresAt ?? null]
  );
  return { rawKey, id: rows[0].id };
}

/** Revoca un código por id — `revoked_at` queda como registro de cuándo y separado de `is_active` para auditoría. */
export async function revokeApiKey(id: number): Promise<void> {
  await pool.query(`UPDATE mcp_api_keys SET is_active = false, revoked_at = now() WHERE id = $1`, [id]);
}
